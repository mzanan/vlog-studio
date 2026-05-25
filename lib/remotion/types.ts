// Props que recibe la composition Remotion para renderizar el vlog.
// Estructura v2: 3 capas globales (video, voiceover, music sections).

export type SegmentProp = {
  kind: 'clip' | 'broll'; // clip = audio original audible; broll = silenciado
  videoUrl: string;
  trimStartSec: number;
  trimEndSec: number;
  durationFrames: number;
  clipWidth: number;
  clipHeight: number;
  // Multiplicador linear sobre el audio del video original (1 = sin cambio).
  // Computado offline por normalizeAudio a partir de loudnorm. Default 1.
  audioVolumeMul: number;
};

export type VoiceoverCueProp = {
  startFrame: number;
  endFrame: number;
};

export type VoiceoverProp = {
  audioUrl: string | null;
  cues: VoiceoverCueProp[]; // para ducking de music; siempre referidos al master timeline
};

export type MusicSectionProp = {
  audioUrl: string | null; // null = sección silenciosa (gap intencional)
  baseVolume: number;
  startFrame: number;
  durationFrames: number;
};

export type VlogInputProps = {
  width: number;
  height: number;
  fps: number;
  segments: SegmentProp[];
  voiceover: VoiceoverProp;
  musicSections: MusicSectionProp[];
  totalDurationFrames: number;
};

export const VLOG_COMPOSITION_ID = 'Vlog';
