// EDL v2 — storytelling pivot.
// Cambios vs v1: VO lineal único con cues en tiempo absoluto, música por secciones
// narrativas en tiempo absoluto (no atadas a segmentIdx), trim semántico con
// cutReason obligatorio, orden propuesto + originalOrder.

export type EdlClipSegment = {
  kind: 'clip';
  clipId: string;
  inMs: number;
  outMs: number;
  cutReason: string;
};

export type EdlBrollSegment = {
  kind: 'broll';
  clipId: string;
  inMs: number;
  outMs: number;
};

export type EdlSegment = EdlClipSegment | EdlBrollSegment;

export type EdlVoiceoverCue = {
  startMs: number;
  endMs: number;
  text: string;
};

export type EdlVoiceover = {
  fullScript: string;
  cues: EdlVoiceoverCue[];
};

export type Energy = 'low' | 'mid' | 'high';

export type MusicSection = {
  id: string;
  startMs: number;
  endMs: number;
  query: string;
  mood: string;
  energy: Energy;
  baseVolume: number;
  reason: string;
  trackUrl?: string;
  trackTitle?: string;
};

export type EdlMusic = {
  sections: MusicSection[];
};

export type Edl = {
  version: 2;
  segments: EdlSegment[];
  originalOrder: string[];
  voiceover: EdlVoiceover;
  music: EdlMusic;
  intent: string;
  targetDurationSec: number | null;
  generatedAt: string;
};

const SPEAKING_WPS_TARGET = 2.3;

export function estimateVoiceoverDurationMs(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.round((words / SPEAKING_WPS_TARGET) * 1000);
}

export function segmentDurationMs(s: EdlSegment): number {
  return s.outMs - s.inMs;
}

export function totalDurationMs(edl: Edl): number {
  return edl.segments.reduce((acc, s) => acc + segmentDurationMs(s), 0);
}

export function defaultBaseVolumeFor(energy: Energy): number {
  if (energy === 'low') return 0.18;
  if (energy === 'high') return 0.22;
  return 0.15;
}

export function isValidEdl(value: unknown): value is Edl {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<Edl>;
  if (v.version !== 2) return false;
  if (!Array.isArray(v.segments)) return false;
  if (!Array.isArray(v.originalOrder)) return false;
  if (!v.voiceover || typeof v.voiceover !== 'object') return false;
  if (typeof v.voiceover.fullScript !== 'string') return false;
  if (!Array.isArray(v.voiceover.cues)) return false;
  if (!v.music || !Array.isArray(v.music.sections)) return false;
  return true;
}

export function isLegacyEdl(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as { version?: unknown; segments?: unknown; musicHints?: unknown };
  return v.version !== 2 && Array.isArray(v.segments);
}

export { SPEAKING_WPS_TARGET };
