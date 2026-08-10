import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { CHAPTERS_DIR, CHAPTERS_GROUPING_PATH } from './paths';

export type VisionTag = {
  escena: string;
  lugar_tipo: string;
  tipo_plano: string;
  movimiento: string;
  momento_dia: string;
  fuerza_visual: number;
  duracion_s: number;
  clip: string;
  dia: string;
};

export type Chapter = {
  title: string;
  clips: VisionTag[];
  reason: string;
};

const CLIP_TIMESTAMP_RE = /^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/;

export function parseClipTimestamp(clip: string): number {
  const match = clip.match(CLIP_TIMESTAMP_RE);
  if (!match) throw new Error(`invalid clip timestamp: ${clip}`);
  const [, y, mo, d, h, mi, s] = match;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

export type SavedGrouping = {
  generatedAt: string;
  chapters: Chapter[];
};

export async function saveGrouping(chapters: Chapter[]): Promise<SavedGrouping> {
  const grouping: SavedGrouping = { generatedAt: new Date().toISOString(), chapters };
  await mkdir(CHAPTERS_DIR, { recursive: true });
  await writeFile(CHAPTERS_GROUPING_PATH, JSON.stringify(grouping, null, 2), 'utf-8');
  return grouping;
}

export async function loadGrouping(): Promise<SavedGrouping | null> {
  try {
    const content = await readFile(CHAPTERS_GROUPING_PATH, 'utf-8');
    return JSON.parse(content) as SavedGrouping;
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    console.error(`[chapters] unreadable grouping file, treating as absent: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
