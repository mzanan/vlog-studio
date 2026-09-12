import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import { CHAPTER_SOURCE_ROOT, VIDEO_EXTENSIONS } from './paths';

export const BROWSE_ROOT = path.resolve(process.env.BROWSE_ROOT ?? homedir());

const MAX_WALK_DEPTH = 8;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export type BrowseEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  videoCount: number;
};

export type BrowseListing = {
  path: string;
  parent: string | null;
  root: string;
  entries: BrowseEntry[];
};

export function isVideoPath(filePath: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function resolveInsideRoot(input: string): string {
  const candidate = path.resolve(input);
  const rel = path.relative(BROWSE_ROOT, candidate);
  if (rel === '') return candidate;
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('path outside the allowed root');
  }
  return candidate;
}

export async function defaultStartDir(): Promise<string> {
  for (const candidate of [CHAPTER_SOURCE_ROOT, path.join(homedir(), 'Movies'), BROWSE_ROOT]) {
    try {
      const resolved = resolveInsideRoot(candidate);
      const info = await stat(resolved);
      if (info.isDirectory()) return resolved;
    } catch {
      continue;
    }
  }
  return BROWSE_ROOT;
}

async function shallowVideoCount(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (entry.isFile() && isVideoPath(entry.name)) count++;
      else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const nested = await readdir(path.join(dir, entry.name), { withFileTypes: true });
        count += nested.filter((e) => e.isFile() && isVideoPath(e.name)).length;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

export async function listDirectory(dir: string): Promise<BrowseListing> {
  const entries = await readdir(dir, { withFileTypes: true });
  const visible = entries.filter((e) => !e.name.startsWith('.'));

  const dirs = await Promise.all(
    visible
      .filter((e) => e.isDirectory())
      .map(async (e): Promise<BrowseEntry> => {
        const full = path.join(dir, e.name);
        return { name: e.name, path: full, isDirectory: true, videoCount: await shallowVideoCount(full) };
      }),
  );

  const files = visible
    .filter((e) => e.isFile() && isVideoPath(e.name))
    .map((e): BrowseEntry => ({ name: e.name, path: path.join(dir, e.name), isDirectory: false, videoCount: 1 }));

  dirs.sort((a, b) => collator.compare(a.name, b.name));
  files.sort((a, b) => collator.compare(a.name, b.name));

  const parentPath = path.dirname(dir);
  const parent = dir === BROWSE_ROOT || parentPath === dir ? null : parentPath;

  return { path: dir, parent, root: BROWSE_ROOT, entries: [...dirs, ...files] };
}

async function walkVideos(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth > MAX_WALK_DEPTH) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkVideos(full, depth + 1, out);
    else if (entry.isFile() && isVideoPath(entry.name)) out.push(full);
  }
}

export async function collectVideoFiles(inputPaths: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const raw of inputPaths) {
    const resolved = resolveInsideRoot(raw);
    const info = await stat(resolved);
    if (info.isDirectory()) await walkVideos(resolved, 0, found);
    else if (isVideoPath(resolved)) found.push(resolved);
  }
  const unique = Array.from(new Set(found));
  unique.sort((a, b) => collator.compare(a, b));
  return unique;
}
