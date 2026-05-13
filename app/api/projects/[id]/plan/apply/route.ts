import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { loadProjectEdls } from '@/lib/project';

// Copia edlSuggestion → edl (la timeline del usuario). Limpia la sugerencia.
export async function POST(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/plan/apply'>) {
  const { id: projectId } = await ctx.params;
  const edls = await loadProjectEdls(projectId);
  if (!edls) return Response.json({ error: 'project not found' }, { status: 404 });
  if (!edls.suggestion) return Response.json({ error: 'no hay sugerencia AI para aplicar' }, { status: 409 });
  await prisma.project.update({
    where: { id: projectId },
    data: {
      edl: edls.suggestion as unknown as Prisma.InputJsonValue,
      edlSuggestion: Prisma.DbNull,
    },
  });
  return Response.json({ edl: edls.suggestion });
}
