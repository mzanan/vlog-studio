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

export const INBOX_DIR = path.join(DATA_ROOT, 'inbox');
export const INBOX_IMPORTED_DIR = path.join(INBOX_DIR, 'imported');

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi']);
