import { NextRequest } from 'next/server';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { clipsDir, thumbsDir } from '@/lib/paths';
import { ffprobe, generateThumbnail, normalizeClip } from '@/lib/ffmpeg';
import { enqueueTranscribe } from '@/lib/transcribeQueue';

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

  const form = await req.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: 'no files' }, { status: 400 });

  const targetClipsDir = clipsDir(projectId);
  const targetThumbsDir = thumbsDir(projectId);
  await mkdir(targetClipsDir, { recursive: true });
  await mkdir(targetThumbsDir, { recursive: true });

  const created = [];
  for (const file of files) {
    const uuid = randomUUID();
    const ext = path.extname(file.name) || '.mp4';
    // Escribimos a un path temporal y normalizamos a .mp4 final (H.264 + faststart)
    // para que el browser pueda seekearlo bien desde Remotion.
    const tempPath = path.join(targetClipsDir, `${uuid}.raw${ext}`);
    const finalPath = path.join(targetClipsDir, `${uuid}.mp4`);
    await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));

    try {
      await normalizeClip(tempPath, finalPath);
      await rm(tempPath, { force: true });
    } catch (err) {
      // Si la normalización falla, conservamos el original con nombre final como fallback.
      console.warn(`[ingest] normalize failed for ${file.name}: ${err}`);
      await rm(finalPath, { force: true });
      await writeFile(finalPath, await (await import('node:fs/promises')).readFile(tempPath));
      await rm(tempPath, { force: true });
    }

    const probe = await ffprobe(finalPath);

    const thumbPath = path.join(targetThumbsDir, `${uuid}.jpg`);
    try {
      await generateThumbnail(finalPath, thumbPath, Math.min(1, probe.durationMs / 2000));
    } catch {
      // thumbnail is non-fatal
    }

    const clip = await prisma.clip.create({
      data: {
        projectId,
        filename: file.name,
        path: finalPath,
        durationMs: probe.durationMs,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
        thumbnailPath: thumbPath,
      },
    });
    created.push(clip);
    enqueueTranscribe(clip.id);
  }

  await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });

  return Response.json({ clips: created }, { status: 201 });
}
