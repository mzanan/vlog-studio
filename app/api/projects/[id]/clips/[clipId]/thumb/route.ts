import { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import { prisma } from '@/lib/db';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/clips/[clipId]/thumb'>) {
  const { clipId } = await ctx.params;
  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  if (!clip?.thumbnailPath) return new Response('not found', { status: 404 });

  try {
    const buf = await readFile(clip.thumbnailPath);
    return new Response(new Uint8Array(buf), {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
