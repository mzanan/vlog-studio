// Cliente Jamendo + cache local. Pixabay descartado: no expone API de música pública.

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Edl } from './edl';
import { MUSIC_CACHE_DIR, MUSIC_MANIFEST_PATH, musicTrackPath } from './paths';

const JAMENDO_API = 'https://api.jamendo.com/v3.0/tracks/';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const TRACK_ID_RE = /^[A-Za-z0-9_-]+$/;

function isJamendoUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (
      (u.protocol === 'https:' || u.protocol === 'http:') &&
      (u.hostname === 'jamendo.com' || u.hostname.endsWith('.jamendo.com'))
    );
  } catch {
    return false;
  }
}

export type JamendoTrack = {
  trackId: string;
  title: string;
  artist: string;
  durationSec: number;
  audioUrl: string;
  audioDownloadUrl: string;
  licenseUrl: string;
  shareUrl: string;
};

type CachedQuery = {
  query: string;
  fetchedAt: number;
  tracks: JamendoTrack[];
};

type Manifest = {
  queries: Record<string, CachedQuery>;
};

async function ensureCacheDir() {
  await mkdir(MUSIC_CACHE_DIR, { recursive: true });
}

async function readManifest(): Promise<Manifest> {
  try {
    return JSON.parse(await readFile(MUSIC_MANIFEST_PATH, 'utf8'));
  } catch {
    return { queries: {} };
  }
}

async function writeManifest(m: Manifest) {
  await ensureCacheDir();
  await writeFile(MUSIC_MANIFEST_PATH, JSON.stringify(m, null, 2));
}

// Serializa lecturas+escrituras del manifest. Sin esto, búsquedas concurrentes
// hacen read-mutate-write no atómico y last-writer-wins pierde entradas.
let manifestChain: Promise<unknown> = Promise.resolve();
function withManifestLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = manifestChain.then(fn, fn);
  manifestChain = next.catch(() => {});
  return next;
}

// El LLM pide secciones de ~3-5min. Bandas reusan cache entre secciones
// con duración parecida y dan margen al filtro durationbetween.
function durationBand(durationMs: number): { key: string; minSec: number; maxSec: number } {
  const sec = Math.round(durationMs / 1000);
  if (sec < 60) return { key: '0-60', minSec: 20, maxSec: 90 };
  if (sec < 120) return { key: '60-120', minSec: 45, maxSec: 180 };
  if (sec < 240) return { key: '120-240', minSec: 90, maxSec: 360 };
  if (sec < 480) return { key: '240-480', minSec: 180, maxSec: 720 };
  return { key: '480+', minSec: 360, maxSec: 1800 };
}

export type SearchOptions = {
  query: string;
  durationMs: number;
  limit?: number;
  instrumental?: boolean;
};

type JamendoApiResponse = {
  headers: { status: string; code: number; error_message?: string };
  results: Array<{
    id: string;
    name: string;
    artist_name: string;
    duration: number;
    audio: string;
    audiodownload: string;
    license_ccurl: string;
    shareurl: string;
  }>;
};

function buildCacheKey(query: string, bandKey: string, instrumental: boolean): string {
  return `${query.toLowerCase().trim()}|${bandKey}|${instrumental ? 'inst' : 'any'}`;
}

const inFlight = new Map<string, Promise<JamendoTrack[]>>();

async function fetchFromJamendo(clientId: string, opts: SearchOptions): Promise<JamendoTrack[]> {
  const band = durationBand(opts.durationMs);
  const params = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    limit: String(Math.max(opts.limit ?? 5, 5)),
    fuzzytags: opts.query,
    audioformat: 'mp32',
    durationbetween: `${band.minSec}_${band.maxSec}`,
    order: 'popularity_month',
  });
  if (opts.instrumental !== false) params.set('vocalinstrumental', 'instrumental');

  const res = await fetch(`${JAMENDO_API}?${params.toString()}`);
  if (!res.ok) throw new Error(`Jamendo search HTTP ${res.status}`);
  const data = (await res.json()) as JamendoApiResponse;
  if (data.headers.status !== 'success') {
    throw new Error(`Jamendo: ${data.headers.error_message ?? 'unknown error'}`);
  }
  return data.results.map((r) => ({
    trackId: String(r.id),
    title: r.name,
    artist: r.artist_name,
    durationSec: r.duration,
    audioUrl: r.audio,
    audioDownloadUrl: r.audiodownload,
    licenseUrl: r.license_ccurl,
    shareUrl: r.shareurl,
  }));
}

export async function searchJamendoMusic(opts: SearchOptions): Promise<JamendoTrack[]> {
  const clientId = process.env.JAMENDO_CLIENT_ID;
  if (!clientId) throw new Error('JAMENDO_CLIENT_ID not configured');

  const instrumental = opts.instrumental !== false;
  const cacheKey = buildCacheKey(opts.query, durationBand(opts.durationMs).key, instrumental);
  const limit = opts.limit ?? 5;

  const cached = (await readManifest()).queries[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.tracks.slice(0, limit);
  }

  const existing = inFlight.get(cacheKey);
  if (existing) return (await existing).slice(0, limit);

  const promise = (async () => {
    const tracks = await fetchFromJamendo(clientId, opts);
    await withManifestLock(async () => {
      const m = await readManifest();
      m.queries[cacheKey] = { query: opts.query, fetchedAt: Date.now(), tracks };
      await writeManifest(m);
    });
    return tracks;
  })().finally(() => inFlight.delete(cacheKey));

  inFlight.set(cacheKey, promise);
  return (await promise).slice(0, limit);
}

export async function downloadTrack(track: JamendoTrack): Promise<string> {
  if (!TRACK_ID_RE.test(track.trackId)) {
    throw new Error(`Invalid trackId: ${track.trackId}`);
  }
  await ensureCacheDir();
  const dest = musicTrackPath(track.trackId);
  try {
    const s = await stat(dest);
    if (s.size > 0) return dest;
  } catch {
    // not cached, fallthrough
  }
  const url = track.audioDownloadUrl || track.audioUrl;
  if (!isJamendoUrl(url)) {
    throw new Error('Refusing to download from a non-Jamendo URL');
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Jamendo download HTTP ${res.status} for track ${track.trackId}`);
  }
  await pipeline(Readable.fromWeb(res.body as unknown as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(dest));
  return dest;
}

export async function fetchMusicForSection(query: string, durationMs: number): Promise<JamendoTrack | null> {
  // Lanza ambas búsquedas en paralelo; preferimos instrumental pero si está
  // vacía caemos a vocals sin agregar un round-trip serial. La 2da query queda
  // cacheada para usos posteriores. Trade-off: 2x search-rate por section
  // primer-hit, pero el cache + in-flight dedup contienen el blast radius.
  const [instTracks, anyTracks] = await Promise.all([
    searchJamendoMusic({ query, durationMs, instrumental: true, limit: 5 }),
    searchJamendoMusic({ query, durationMs, instrumental: false, limit: 5 }),
  ]);
  const track = instTracks[0] ?? anyTracks[0];
  if (!track) return null;
  await downloadTrack(track);
  return track;
}

// Para cada section: busca + descarga. Secciones con el mismo query+band
// comparten resultado vía in-flight dedup en searchJamendoMusic. Fallos
// silenciosos: la section queda sin trackId y el render la trata como gap.
export async function populateMusicSections(edl: Edl): Promise<void> {
  await Promise.all(
    edl.music.sections.map(async (sec) => {
      try {
        const track = await fetchMusicForSection(sec.query, sec.endMs - sec.startMs);
        if (!track) {
          console.warn(`[music] no results for "${sec.query}", section ${sec.id} remains silent`);
          return;
        }
        sec.trackId = track.trackId;
        sec.trackTitle = track.title;
        sec.trackArtist = track.artist;
        sec.trackUrl = track.shareUrl;
        sec.trackLicenseUrl = track.licenseUrl;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[music] section ${sec.id} ("${sec.query}") failed: ${msg}`);
      }
    }),
  );
}
