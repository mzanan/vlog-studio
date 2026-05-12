export type EdlClipSegment = {
  kind: 'clip';
  clipId: string;
  inMs: number;
  outMs: number;
  reason?: string;
};

export type EdlVoiceoverSegment = {
  kind: 'voiceover';
  script: string;
  durationEstimateMs: number;
  brollClipIds: string[];
  reason?: string;
};

export type EdlSegment = EdlClipSegment | EdlVoiceoverSegment;

export type EdlMusicHint = {
  segmentIdx: number;
  mood: string;
  energy: 'low' | 'mid' | 'high';
};

export type Edl = {
  segments: EdlSegment[];
  musicHints: EdlMusicHint[];
  intent: string;
  targetDurationSec: number | null;
  generatedAt: string;
};

const SPEAKING_WPS = 2.5;
const SPEAKING_WPS_TARGET = 2.3;

export function estimateVoiceoverDurationMs(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / SPEAKING_WPS_TARGET) * 1000);
}

export function totalDurationMs(edl: Edl): number {
  return edl.segments.reduce((acc, s) => {
    if (s.kind === 'clip') return acc + (s.outMs - s.inMs);
    return acc + s.durationEstimateMs;
  }, 0);
}

export function isValidEdl(value: unknown): value is Edl {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Edl>;
  return Array.isArray(v.segments) && Array.isArray(v.musicHints);
}

export { SPEAKING_WPS, SPEAKING_WPS_TARGET };
