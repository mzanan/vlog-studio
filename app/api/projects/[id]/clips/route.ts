import { NextRequest } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { clipsDir, thumbsDir } from '@/lib/paths';
import { ffprobe, generateThumbnail } from '@/lib/ffmpeg';
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
    const ext = path.extname(file.name) || '.mp4';
    const filename = `${randomUUID()}${ext}`;
    const fullPath = path.join(targetClipsDir, filename);
    await writeFile(fullPath, Buffer.from(await file.arrayBuffer()));

    const probe = await ffprobe(fullPath);

    const thumbPath = path.join(targetThumbsDir, `${path.parse(filename).name}.jpg`);
    try {
      await generateThumbnail(fullPath, thumbPath, Math.min(1, probe.durationMs / 2000));
    } catch {
      // thumbnail is non-fatal
    }

    const clip = await prisma.clip.create({
      data: {
        projectId,
        filename: file.name,
        path: fullPath,
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
