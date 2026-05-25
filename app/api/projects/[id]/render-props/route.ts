import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { buildDefaultEdl } from '@/lib/edl';
import { loadProjectPlan } from '@/lib/project';
import { buildVlogProps } from '@/lib/render-props';
import { getBaseUrl } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/render-props'>) {
  const { id: projectId } = await ctx.params;

  const plan = await loadProjectPlan(projectId);
  if (!plan) return Response.json({ error: 'project not found' }, { status: 404 });

  const clips = await prisma.clip.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  if (clips.length === 0) return Response.json({ error: 'sin clips' }, { status: 409 });

  const edl = plan.edl ?? buildDefaultEdl(clips);
  const props = await buildVlogProps({ projectId, edl, clips, baseUrl: getBaseUrl(req) });
  return Response.json({ props });
}
