import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { serveFile } from '@/lib/http';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/clips/[clipId]/thumb'>) {
  const { clipId } = await ctx.params;
  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  if (!clip?.thumbnailPath) return new Response('not found', { status: 404 });
  return serveFile(clip.thumbnailPath, {
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=3600',
  });
}
