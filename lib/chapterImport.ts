import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { prisma } from './db';
import { ingestClipFile } from './ingest';
import { Chapter, loadGrouping } from './chapters';
import { CHAPTERS_DIR, CHAPTERS_IMPORT_PROGRESS_PATH } from './paths';

const SOURCE_ROOT = path.join(homedir(), 'Movies', 'phone-camera', '2026', 'horizontal-1080', '1. tokio');

export type ChapterImportProgress = {
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'done' | 'error';
  error: string | null;
  totalClips: number;
  doneClips: number;
  chapters: {
    title: string;
    reason: string;
    projectId: string | null;
    status: 'pending' | 'importing' | 'done';
    totalClips: number;
    imported: number;
    failed: { clip: string; error: string }[];
  }[];
};

let running = false;

async function saveProgress(progress: ChapterImportProgress) {
  await mkdir(CHAPTERS_DIR, { recursive: true });
  await writeFile(CHAPTERS_IMPORT_PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf-8');
}

export async function loadImportProgress(): Promise<ChapterImportProgress | null> {
  let progress: ChapterImportProgress;
  try {
    const content = await readFile(CHAPTERS_IMPORT_PROGRESS_PATH, 'utf-8');
    progress = JSON.parse(content) as ChapterImportProgress;
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    console.error(`[chapters] unreadable progress file, treating as absent: ${err instanceof Error ? err.message : err}`);
    return null;
  }

  if (progress.status === 'running' && !running) {
    progress.status = 'error';
    progress.error = 'interrupted by server restart';
    progress.finishedAt = new Date().toISOString();
    await saveProgress(progress);
    console.warn('[chapters] found stale running progress, marked as interrupted');
  }
  return progress;
}

export async function startChapterImport(maxChapters?: number): Promise<ChapterImportProgress> {
  if (running) {
    const current = await loadImportProgress();
    if (!current) throw new Error('import already starting');
    return current;
  }
  running = true;

  try {
    const existing = await loadImportProgress();
    if (existing?.status === 'running') {
      existing.status = 'error';
      existing.error = 'interrupted by server restart';
      existing.finishedAt = new Date().toISOString();
      await saveProgress(existing);
    }

    const grouping = await loadGrouping();
    if (!grouping) throw new Error('no saved grouping, generate one first');

    const chapters = maxChapters ? grouping.chapters.slice(0, maxChapters) : grouping.chapters;
    const totalClips = chapters.reduce((sum, c) => sum + c.clips.length, 0);

    const progress: ChapterImportProgress = {
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: 'running',
      error: null,
      totalClips,
      doneClips: 0,
      chapters: chapters.map((c) => ({
        title: c.title,
        reason: c.reason,
        projectId: null,
        status: 'pending',
        totalClips: c.clips.length,
        imported: 0,
        failed: [],
      })),
    };
    await saveProgress(progress);

    void runImport(chapters, progress).finally(() => {
      running = false;
    });

    return progress;
  } catch (err) {
    running = false;
    throw err;
  }
}

async function runImport(chapters: Chapter[], progress: ChapterImportProgress) {
  console.log(`[chapters] importing ${chapters.length} chapters, ${progress.totalClips} clips (background job)...`);
  try {
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];
      const entry = progress.chapters[i];
      entry.status = 'importing';
      const project = await prisma.project.create({
        data: { name: chapter.title, intent: chapter.reason },
      });
      entry.projectId = project.id;
      console.log(`[chapters] "${chapter.title}" -> project ${project.id} (${chapter.clips.length} clips)`);
      await saveProgress(progress);

      for (const tag of chapter.clips) {
        const sourcePath = path.join(SOURCE_ROOT, tag.dia, `${tag.clip}.mp4`);
        try {
          await ingestClipFile(project.id, sourcePath, `${tag.clip}.mp4`, undefined, true);
          entry.imported++;
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          entry.failed.push({ clip: tag.clip, error });
          console.error(`[chapters] FAILED ${tag.clip}: ${error}`);
        }
        progress.doneClips++;
        console.log(`[chapters] ${progress.doneClips}/${progress.totalClips} done (${tag.clip})`);
        await saveProgress(progress);
      }

      entry.status = 'done';
      await saveProgress(progress);
    }

    progress.status = 'done';
    progress.finishedAt = new Date().toISOString();
    console.log(`[chapters] finished: ${chapters.length} projects, ${progress.doneClips}/${progress.totalClips} clips processed`);
  } catch (err) {
    progress.status = 'error';
    progress.error = err instanceof Error ? err.message : String(err);
    progress.finishedAt = new Date().toISOString();
    console.error(`[chapters] import job failed: ${progress.error}`);
  }
  await saveProgress(progress);
}
