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
