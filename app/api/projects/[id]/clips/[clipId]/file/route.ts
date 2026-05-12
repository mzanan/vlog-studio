import { NextRequest } from 'next/server';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';

const MIME = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
  '.avi': 'video/x-msvideo',
} as const;

export async function GET(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/clips/[clipId]/file'>) {
  const { clipId } = await ctx.params;
  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  if (!clip) return new Response('not found', { status: 404 });

  try {
    await stat(clip.path);
  } catch {
    return new Response('not found', { status: 404 });
  }

  const ext = path.extname(clip.path).toLowerCase() as keyof typeof MIME;
  const contentType = MIME[ext] ?? 'application/octet-stream';

  const buf = await readFile(clip.path);
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buf.length),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=600',
    },
  });
}
