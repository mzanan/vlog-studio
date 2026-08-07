import path from 'node:path';

export const DATA_ROOT = path.resolve(process.cwd(), 'data');

export function projectDir(projectId: string) {
  return path.join(DATA_ROOT, 'projects', projectId);
}

export function clipsDir(projectId: string) {
  return path.join(projectDir(projectId), 'clips');
}

export function thumbsDir(projectId: string) {
  return path.join(projectDir(projectId), 'thumbs');
}

export function voDir(projectId: string) {
  return path.join(projectDir(projectId), 'vo');
}

export const INBOX_DIR = path.join(DATA_ROOT, 'inbox');
export const INBOX_IMPORTED_DIR = path.join(INBOX_DIR, 'imported');

export const MUSIC_CACHE_DIR = path.join(DATA_ROOT, 'music-cache');
export const MUSIC_MANIFEST_PATH = path.join(MUSIC_CACHE_DIR, 'manifest.json');

export function musicTrackPath(trackId: string) {
  return path.join(MUSIC_CACHE_DIR, `${trackId}.mp3`);
}

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi']);
