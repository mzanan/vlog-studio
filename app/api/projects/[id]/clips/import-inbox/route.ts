import { NextRequest } from 'next/server';
import { mkdir, readdir, rename, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { clipsDir, thumbsDir, INBOX_DIR, INBOX_IMPORTED_DIR, VIDEO_EXTENSIONS } from '@/lib/paths';
import { ffprobe, generateThumbnail } from '@/lib/ffmpeg';
import { enqueueTranscribe } from '@/lib/transcribeQueue';

export async function POST(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/clips/import-inbox'>) {
  const { id: projectId } = await ctx.params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return Response.json({ error: 'project not found' }, { status: 404 });

  try {
    await stat(INBOX_DIR);
  } catch {
    return Response.json({ error: `Inbox no existe en ${INBOX_DIR}` }, { status: 404 });
  }

  await mkdir(INBOX_IMPORTED_DIR, { recursive: true });
  const targetClipsDir = clipsDir(projectId);
  const targetThumbsDir = thumbsDir(projectId);
  await mkdir(targetClipsDir, { recursive: true });
  await mkdir(targetThumbsDir, { recursive: true });

  const entries = await readdir(INBOX_DIR, { withFileTypes: true });
  const candidates = entries
    .filter((e) => e.isFile() && VIDEO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(INBOX_DIR, e.name));

  const imported: string[] = [];
  const failed: { file: string; error: string }[] = [];

  for (const sourcePath of candidates) {
    try {
      const originalName = path.basename(sourcePath);
      const ext = path.extname(originalName).toLowerCase();
      const filename = `${randomUUID()}${ext}`;
      const destPath = path.join(targetClipsDir, filename);

      await copyFile(sourcePath, destPath);

      const probe = await ffprobe(destPath);
      const thumbPath = path.join(targetThumbsDir, `${path.parse(filename).name}.jpg`);
      try {
        await generateThumbnail(destPath, thumbPath, Math.min(1, probe.durationMs / 2000));
      } catch {
        // non-fatal
      }

      const clip = await prisma.clip.create({
        data: {
          projectId,
          filename: originalName,
          path: destPath,
          durationMs: probe.durationMs,
          width: probe.width,
          height: probe.height,
          fps: probe.fps,
          thumbnailPath: thumbPath,
        },
      });

      await rename(sourcePath, path.join(INBOX_IMPORTED_DIR, originalName));
      enqueueTranscribe(clip.id);
      imported.push(originalName);
    } catch (err) {
      failed.push({ file: path.basename(sourcePath), error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (imported.length > 0) {
    await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
  }

  return Response.json({ imported: imported.length, failed, files: imported }, { status: 201 });
}
