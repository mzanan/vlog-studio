import path from 'node:path';
import { homedir } from 'node:os';

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

export const CHAPTERS_DIR = path.join(DATA_ROOT, 'chapters');
export const CHAPTERS_GROUPING_PATH = path.join(CHAPTERS_DIR, 'grouping.json');
export const CHAPTERS_IMPORT_PROGRESS_PATH = path.join(CHAPTERS_DIR, 'import-progress.json');
export const VISION_TAGS_DIR = path.join(DATA_ROOT, 'vision-tags');
export const MOMENT_SCORES_DIR = path.join(DATA_ROOT, 'moment-scores');

export function momentScoresPath(projectId: string) {
  return path.join(MOMENT_SCORES_DIR, `${projectId}.jsonl`);
}
export const CHAPTER_SOURCE_ROOT =
  process.env.CHAPTER_SOURCE_ROOT ?? path.join(homedir(), 'Movies', 'phone-camera', '2026', 'horizontal-1080', '1. tokio');

export function musicTrackPath(trackId: string) {
  return path.join(MUSIC_CACHE_DIR, `${trackId}.mp3`);
}

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi']);
