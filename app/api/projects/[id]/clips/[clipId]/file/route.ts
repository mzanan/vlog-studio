import { NextRequest } from 'next/server';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { serveFile } from '@/lib/http';

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
  '.avi': 'video/x-msvideo',
};

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/clips/[clipId]/file'>) {
  const { clipId } = await ctx.params;
  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  if (!clip) return new Response('not found', { status: 404 });

  const ext = path.extname(clip.path).toLowerCase();
  return serveFile(clip.path, {
    contentType: MIME[ext] ?? 'application/octet-stream',
    cacheControl: 'private, max-age=600',
  });
}
