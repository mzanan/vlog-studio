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
