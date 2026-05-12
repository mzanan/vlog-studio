import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { isValidEdl } from '@/lib/edl';
import { MusicBlock, initBlocksFromEdl, isValidMusicBlocks } from '@/lib/music';

async function loadProject(projectId: string) {
  return prisma.project.findUnique({ where: { id: projectId } });
}

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/music'>) {
  const { id } = await ctx.params;
  const project = await loadProject(id);
  if (!project) return Response.json({ error: 'project not found' }, { status: 404 });

  if (isValidMusicBlocks(project.musicBlocks)) {
    return Response.json({ blocks: project.musicBlocks });
  }

  if (!isValidEdl(project.edl)) {
    return Response.json({ blocks: [], needsEdl: true });
  }

  const blocks = initBlocksFromEdl(project.edl);
  await prisma.project.update({
    where: { id },
    data: { musicBlocks: blocks as unknown as Prisma.InputJsonValue },
  });
  return Response.json({ blocks });
}

export async function PUT(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/music'>) {
  const { id } = await ctx.params;
  const body = await req.json();
  const blocks = body?.blocks as MusicBlock[] | undefined;
  if (!isValidMusicBlocks(blocks)) {
    return Response.json({ error: 'blocks inválidos' }, { status: 400 });
  }

  await prisma.project.update({
    where: { id },
    data: { musicBlocks: blocks as unknown as Prisma.InputJsonValue },
  });
  return Response.json({ blocks });
}

// Reset: limpia musicBlocks para que el próximo GET re-inicialice con un solo bloque.
export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/music'>) {
  const { id } = await ctx.params;
  await prisma.project.update({
    where: { id },
    data: { musicBlocks: Prisma.JsonNull },
  });
  return Response.json({ reset: true });
}
