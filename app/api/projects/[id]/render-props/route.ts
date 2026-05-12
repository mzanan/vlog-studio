import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { isValidEdl } from '@/lib/edl';
import { isValidMusicBlocks } from '@/lib/music';
import { buildVlogProps } from '@/lib/render-props';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/render-props'>) {
  const { id: projectId } = await ctx.params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { clips: true },
  });
  if (!project) return Response.json({ error: 'project not found' }, { status: 404 });
  if (!isValidEdl(project.edl)) return Response.json({ error: 'sin EDL' }, { status: 409 });

  const blocks = isValidMusicBlocks(project.musicBlocks) ? project.musicBlocks : [];
  const protocol = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('host') ?? 'localhost:3000';
  const baseUrl = `${protocol}://${host}`;

  const props = await buildVlogProps({
    projectId,
    edl: project.edl,
    musicBlocks: blocks,
    clips: project.clips,
    baseUrl,
  });

  return Response.json({ props });
}
