export type VideoFormat = 'landscape' | 'vertical';

export const VIDEO_FORMATS: VideoFormat[] = ['landscape', 'vertical'];
export const DEFAULT_VIDEO_FORMAT: VideoFormat = 'landscape';

export type VideoFit = 'contain' | 'cover';

export type FormatSpec = {
  width: number;
  height: number;
  fit: VideoFit;
};

const LANDSCAPE: FormatSpec = { width: 1920, height: 1080, fit: 'contain' };
const VERTICAL: FormatSpec = { width: 1080, height: 1920, fit: 'cover' };

export function isValidVideoFormat(value: unknown): value is VideoFormat {
  return typeof value === 'string' && (VIDEO_FORMATS as string[]).includes(value);
}

export function formatSpecFor(format: VideoFormat): FormatSpec {
  return format === 'vertical' ? VERTICAL : LANDSCAPE;
}

export function formatSlug(format: VideoFormat): string {
  return format === 'vertical' ? 'short' : 'vlog';
}
