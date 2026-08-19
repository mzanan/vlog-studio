// EDL v2 — storytelling pivot.
// Cambios vs v1: VO lineal único con cues en tiempo absoluto, música por secciones
// narrativas en tiempo absoluto (no atadas a segmentIdx), trim semántico con
// cutReason obligatorio, orden propuesto + originalOrder.

import { randomUUID, createHash } from 'node:crypto';

export type EdlClipSegment = {
  id: string;
  kind: 'clip';
  clipId: string;
  inMs: number;
  outMs: number;
  cutReason: string;
};

export type EdlBrollSegment = {
  id: string;
  kind: 'broll';
  clipId: string;
  inMs: number;
  outMs: number;
  speed?: number;
  cutReason?: string;
};

export const MIN_BROLL_SPEED = 1;
export const MAX_BROLL_SPEED = 3;

export function clampBrollSpeed(speed: number | undefined): number {
  if (typeof speed !== 'number' || Number.isNaN(speed)) return 1;
  return Math.max(MIN_BROLL_SPEED, Math.min(MAX_BROLL_SPEED, speed));
}

export type EdlSegment = EdlClipSegment | EdlBrollSegment;

export type EdlVoiceoverCue = {
  startMs: number;
  endMs: number;
  text: string;
};

export type EdlVoiceover = {
  fullScript: string;
  cues: EdlVoiceoverCue[];
  // Fingerprint del script+cues en el momento en que se grabó `vo/master.wav`.
  // Sin esto, agregar/editar cues después de grabar deja narración sin cobertura
  // y el chequeo de "VO faltante" en export no lo detecta (el archivo sigue existiendo).
  recordedFingerprint?: string;
};

export function voiceoverFingerprint(v: Pick<EdlVoiceover, 'fullScript' | 'cues'>): string {
  return createHash('sha256')
    .update(JSON.stringify({ fullScript: v.fullScript, cues: v.cues }))
    .digest('hex')
    .slice(0, 16);
}

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
  // Populated post-LLM por Jamendo lookup. `trackId` resuelve al MP3 cacheado
  // en data/music-cache/<trackId>.mp3; el resto es para attribution.
  trackId?: string;
  trackUrl?: string;
  trackTitle?: string;
  trackArtist?: string;
  trackLicenseUrl?: string;
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

export function playbackDurationMs(s: EdlSegment): number {
  const speed = s.kind === 'broll' ? clampBrollSpeed(s.speed) : 1;
  return (s.outMs - s.inMs) / speed;
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

// Fallback cuando el proyecto no tiene EDL persistido: todos los clips
// full-length sin VO ni música, en el orden recibido.
export function buildDefaultEdl(clips: Array<{ id: string; durationMs: number; hasVoice?: boolean }>): Edl {
  return {
    version: 2,
    segments: clips.map((c): EdlSegment =>
      c.hasVoice === false
        ? { id: randomUUID(), kind: 'broll', clipId: c.id, inMs: 0, outMs: c.durationMs }
        : { id: randomUUID(), kind: 'clip', clipId: c.id, inMs: 0, outMs: c.durationMs, cutReason: '' },
    ),
    originalOrder: clips.map((c) => c.id),
    voiceover: { fullScript: '', cues: [] },
    music: { sections: [] },
    intent: '',
    targetDurationSec: null,
    generatedAt: new Date().toISOString(),
  };
}

export function isLegacyEdl(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as { version?: unknown; segments?: unknown; musicHints?: unknown };
  return v.version !== 2 && Array.isArray(v.segments);
}

export { SPEAKING_WPS_TARGET };
