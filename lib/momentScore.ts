import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run } from './ffmpeg';
import { MOMENT_SCORES_DIR, momentScoresPath } from './paths';

const SIGNAL_TIMEOUT_MS = 600_000;
const SAMPLE_FPS = 2;
const CANDIDATE_WINDOW_MS = [2000, 3000, 4000, 5000, 6000];
const WINDOW_STRIDE_MS = 500;
const BLUR_SATURATION = 80;
const MOTION_SATURATION = 50;
const AUDIO_FLOOR_DB = -50;
const CUT_SCORE_THRESHOLD = 0.3;
const SIGNAL_WEIGHTS = {
  exposure: 0.15,
  sharpness: 0.25,
  motion: 0.2,
  audioEnergy: 0.25,
  cutFree: 0.15,
};

export type SignalScores = {
  exposure: number;
  sharpness: number;
  motion: number;
  audioEnergy: number;
  cutPenalty: number;
};

export type MomentWindow = {
  startMs: number;
  endMs: number;
  score: number;
  signals: SignalScores;
};

export type MomentPick = {
  windowIndex: number;
  reason: string;
};

export type ClipMomentScore = {
  clipId: string;
  durationMs: number;
  windows: MomentWindow[];
  pick?: MomentPick;
};

type MetadataFrame = { tMs: number; tags: Record<string, number> };
type VideoSample = { tMs: number; yavg: number; ydif: number; blur: number; sceneScore: number };
type AudioSample = { tMs: number; rmsDb: number };

function parseMetadataLog(log: string): MetadataFrame[] {
  const frames: MetadataFrame[] = [];
  let current: MetadataFrame | null = null;
  for (const line of log.split('\n')) {
    const frameMatch = line.match(/^frame:\d+\s+pts:\S+\s+pts_time:(-?[\d.]+)/);
    if (frameMatch) {
      if (current) frames.push(current);
      current = { tMs: Math.round(parseFloat(frameMatch[1]) * 1000), tags: {} };
      continue;
    }
    const tagMatch = line.match(/^(lavfi\.\S+)=(-?[\d.]+|-inf|nan)$/);
    if (tagMatch && current) {
      const raw = tagMatch[2];
      current.tags[tagMatch[1]] = raw === '-inf' ? -Infinity : raw === 'nan' ? NaN : parseFloat(raw);
    }
  }
  if (current) frames.push(current);
  return frames;
}

async function runToMetadataLog(
  input: string,
  filterKind: 'video' | 'audio',
  filterBody: string,
  signal?: AbortSignal,
): Promise<MetadataFrame[]> {
  const logPath = path.join(tmpdir(), `momentscore-${randomUUID()}.log`);
  const flag = filterKind === 'video' ? '-vf' : '-af';
  const printFilter = filterKind === 'video' ? 'metadata=print' : 'ametadata=print';
  try {
    await run(
      'ffmpeg',
      ['-v', 'error', '-i', input, flag, `${filterBody},${printFilter}:file=${logPath}`, '-f', 'null', '-'],
      { timeoutMs: SIGNAL_TIMEOUT_MS, signal },
    );
    const log = await readFile(logPath, 'utf-8');
    return parseMetadataLog(log);
  } finally {
    await rm(logPath, { force: true });
  }
}

async function sampleVideoSignals(input: string, signal?: AbortSignal): Promise<VideoSample[]> {
  const filterBody = `fps=${SAMPLE_FPS},signalstats,blurdetect,select='gte(scene\\,0)'`;
  const frames = await runToMetadataLog(input, 'video', filterBody, signal);
  return frames.map((f) => ({
    tMs: f.tMs,
    yavg: f.tags['lavfi.signalstats.YAVG'] ?? NaN,
    ydif: f.tags['lavfi.signalstats.YDIF'] ?? 0,
    blur: f.tags['lavfi.blur'] ?? NaN,
    sceneScore: f.tags['lavfi.scene_score'] ?? 0,
  }));
}

async function sampleAudioSignals(input: string, signal?: AbortSignal): Promise<AudioSample[]> {
  const filterBody = 'aresample=48000,asetnsamples=n=48000,astats=metadata=1:reset=1';
  const frames = await runToMetadataLog(input, 'audio', filterBody, signal);
  return frames.map((f) => ({
    tMs: f.tMs,
    rmsDb: f.tags['lavfi.astats.Overall.RMS_level'] ?? AUDIO_FLOOR_DB,
  }));
}

function average(values: number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return NaN;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function scoreRange(video: VideoSample[], audio: AudioSample[], startMs: number, endMs: number): SignalScores {
  const videoInRange = video.filter((s) => s.tMs >= startMs && s.tMs < endMs);
  const audioInRange = audio.filter((s) => s.tMs >= startMs && s.tMs < endMs);

  const yavg = average(videoInRange.map((s) => s.yavg));
  const exposure = clamp01(1 - Math.abs(yavg - 128) / 128);

  const blur = average(videoInRange.map((s) => s.blur));
  const sharpness = Number.isFinite(blur) ? clamp01(1 - blur / BLUR_SATURATION) : 0;

  const ydif = average(videoInRange.map((s) => s.ydif));
  const motion = clamp01(ydif / MOTION_SATURATION);

  const rmsDb = average(audioInRange.map((s) => s.rmsDb));
  const audioEnergy = clamp01((rmsDb - AUDIO_FLOOR_DB) / -AUDIO_FLOOR_DB);

  const maxScene = videoInRange.reduce((m, s) => Math.max(m, s.sceneScore), 0);
  const cutPenalty = maxScene >= CUT_SCORE_THRESHOLD ? clamp01(maxScene) : 0;

  return { exposure, sharpness, motion, audioEnergy, cutPenalty };
}

function combinedScore(signals: SignalScores): number {
  return (
    signals.exposure * SIGNAL_WEIGHTS.exposure +
    signals.sharpness * SIGNAL_WEIGHTS.sharpness +
    signals.motion * SIGNAL_WEIGHTS.motion +
    signals.audioEnergy * SIGNAL_WEIGHTS.audioEnergy +
    (1 - signals.cutPenalty) * SIGNAL_WEIGHTS.cutFree
  );
}

function generateCandidates(durationMs: number): Array<{ startMs: number; endMs: number }> {
  const candidates: Array<{ startMs: number; endMs: number }> = [];
  for (const windowMs of CANDIDATE_WINDOW_MS) {
    if (windowMs > durationMs) continue;
    for (let startMs = 0; startMs + windowMs <= durationMs; startMs += WINDOW_STRIDE_MS) {
      candidates.push({ startMs, endMs: startMs + windowMs });
    }
  }
  return candidates;
}

function overlaps(a: { startMs: number; endMs: number }, b: { startMs: number; endMs: number }): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

function selectTopK(windows: MomentWindow[], k: number): MomentWindow[] {
  const sorted = [...windows].sort((a, b) => b.score - a.score);
  const picked: MomentWindow[] = [];
  for (const candidate of sorted) {
    if (picked.length >= k) break;
    if (picked.some((p) => overlaps(p, candidate))) continue;
    picked.push(candidate);
  }
  return picked.sort((a, b) => a.startMs - b.startMs);
}

export async function scoreClip(
  clipId: string,
  input: string,
  durationMs: number,
  topK: number,
  signal?: AbortSignal,
): Promise<ClipMomentScore> {
  const [video, audio] = await Promise.all([
    sampleVideoSignals(input, signal),
    sampleAudioSignals(input, signal),
  ]);

  const candidates = generateCandidates(durationMs);
  const scored = candidates.map(({ startMs, endMs }) => {
    const signals = scoreRange(video, audio, startMs, endMs);
    return { startMs, endMs, score: combinedScore(signals), signals };
  });

  return { clipId, durationMs, windows: selectTopK(scored, topK) };
}

export async function writeMomentScores(projectId: string, scores: ClipMomentScore[]): Promise<void> {
  await mkdir(MOMENT_SCORES_DIR, { recursive: true });
  const lines = scores.map((s) => JSON.stringify(s)).join('\n');
  await writeFile(momentScoresPath(projectId), lines + '\n', 'utf-8');
}

export async function loadMomentScores(projectId: string): Promise<ClipMomentScore[]> {
  try {
    const content = await readFile(momentScoresPath(projectId), 'utf-8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ClipMomentScore);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export function momentScoreForClip(clipId: string, scores: ClipMomentScore[]): ClipMomentScore | undefined {
  return scores.find((s) => s.clipId === clipId);
}

export function bestOf(windows: MomentWindow[]): MomentWindow {
  return windows.reduce((best, w) => (w.score > best.score ? w : best));
}

export function bestWindowFor(score: ClipMomentScore): MomentWindow | undefined {
  if (score.windows.length === 0) return undefined;
  const pickedIndex = score.pick?.windowIndex;
  if (typeof pickedIndex === 'number' && score.windows[pickedIndex]) return score.windows[pickedIndex];
  return bestOf(score.windows);
}

const SIGNAL_LABELS: Record<keyof SignalScores, string> = {
  exposure: 'exposure',
  sharpness: 'sharpness',
  motion: 'motion',
  audioEnergy: 'audio',
  cutPenalty: 'no cuts',
};

export function describeMomentSignals(signals: SignalScores): string {
  const positive = { ...signals, cutPenalty: 1 - signals.cutPenalty };
  const top = (Object.keys(positive) as Array<keyof SignalScores>).reduce((a, b) =>
    positive[b] > positive[a] ? b : a,
  );
  return `automatic criterion (ffmpeg): stands out in ${SIGNAL_LABELS[top]}`;
}
