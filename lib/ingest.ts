import { mkdir, rename, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from './db';
import { clipsDir, thumbsDir } from './paths';
import { ffprobe, generateThumbnail, normalizeClip } from './ffmpeg';
import { enqueueTranscribe } from './transcribeQueue';
import { runHeavy } from './heavyQueue';

export async function ingestClipFile(
  projectId: string,
  sourcePath: string,
  originalName: string,
  signal?: AbortSignal,
  skipTranscription = false
): Promise<string> {
  const targetClipsDir = clipsDir(projectId);
  const targetThumbsDir = thumbsDir(projectId);
  await mkdir(targetClipsDir, { recursive: true });
  await mkdir(targetThumbsDir, { recursive: true });

  const uuid = randomUUID();
  const ext = path.extname(originalName).toLowerCase();
  const tempPath = path.join(targetClipsDir, `${uuid}.raw${ext}`);
  const finalPath = path.join(targetClipsDir, `${uuid}.mp4`);

  await copyFile(sourcePath, tempPath);

  const thumbPath = path.join(targetThumbsDir, `${uuid}.jpg`);
  const probe = await runHeavy(async () => {
    try {
      await normalizeClip(tempPath, finalPath, signal);
      await rm(tempPath, { force: true });
    } catch (normErr) {
      console.warn(`[ingest] normalize failed for ${originalName}: ${normErr}`);
      await rm(finalPath, { force: true });
      await rename(tempPath, finalPath);
    }

    const result = await ffprobe(finalPath, signal);
    try {
      await generateThumbnail(finalPath, thumbPath, Math.min(1, result.durationMs / 2000), signal);
    } catch {
      // non-fatal
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
      transcribedAt: skipTranscription ? new Date() : null,
    },
  });

  if (!skipTranscription) enqueueTranscribe(clip.id);
  return clip.id;
}
