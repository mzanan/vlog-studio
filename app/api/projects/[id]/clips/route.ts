import { NextRequest } from 'next/server';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { clipsDir, thumbsDir } from '@/lib/paths';
import { ffprobe, generateThumbnail, normalizeClip } from '@/lib/ffmpeg';
import { enqueueTranscribe } from '@/lib/transcribeQueue';
import { runHeavy } from '@/lib/heavyQueue';
import { streamRequestBodyToFile } from '@/lib/upload';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/clips'>) {
  const { id } = await ctx.params;
  const clips = await prisma.clip.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'asc' },
  });
  return Response.json({ clips });
}

export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/clips'>) {
  const { id: projectId } = await ctx.params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return Response.json({ error: 'project not found' }, { status: 404 });

  const rawName = req.headers.get('x-filename');
  if (!rawName) return Response.json({ error: 'falta header x-filename' }, { status: 400 });
  const originalName = path.basename(decodeURIComponent(rawName));

  const targetClipsDir = clipsDir(projectId);
  const targetThumbsDir = thumbsDir(projectId);
  await mkdir(targetClipsDir, { recursive: true });
  await mkdir(targetThumbsDir, { recursive: true });

  const uuid = randomUUID();
  const ext = path.extname(originalName) || '.mp4';
  const tempPath = path.join(targetClipsDir, `${uuid}.raw${ext}`);
  const finalPath = path.join(targetClipsDir, `${uuid}.mp4`);
  const thumbPath = path.join(targetThumbsDir, `${uuid}.jpg`);

  try {
    await streamRequestBodyToFile(req.body, tempPath, req.signal);
  } catch (err) {
    await rm(tempPath, { force: true });
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `upload failed: ${message}` }, { status: 400 });
  }

  const probe = await runHeavy(async () => {
    try {
      await normalizeClip(tempPath, finalPath);
      await rm(tempPath, { force: true });
    } catch (err) {
      console.warn(`[ingest] normalize failed for ${originalName}: ${err}`);
      await rm(finalPath, { force: true });
      await rename(tempPath, finalPath);
    }

    const result = await ffprobe(finalPath);
    try {
      await generateThumbnail(finalPath, thumbPath, Math.min(1, result.durationMs / 2000));
    } catch {
      // thumbnail is non-fatal
    }
    return result;
  });

  const clip = await prisma.clip.create({
    data: {
      projectId,
      filename: originalName,
      path: finalPath,
      durationMs: probe.durationMs,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      thumbnailPath: thumbPath,
    },
  });

  await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
  enqueueTranscribe(clip.id);

  return Response.json({ clip }, { status: 201 });
}
