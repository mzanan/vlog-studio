import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { loadProjectPlan } from '@/lib/project';
import { Suggestion } from '@/lib/suggestions';

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<'/api/projects/[id]/suggestions/[suggestionId]/reject'>,
) {
  const { id: projectId, suggestionId } = await ctx.params;
  const plan = await loadProjectPlan(projectId);
  if (!plan) return Response.json({ error: 'project not found' }, { status: 404 });

  const target = plan.suggestions.find((s) => s.id === suggestionId);
  if (!target) return Response.json({ error: 'suggestion not found' }, { status: 404 });
  if (target.status !== 'pending') {
    return Response.json({ error: `suggestion ya está ${target.status}` }, { status: 409 });
  }

  const updated = plan.suggestions.map((s): Suggestion =>
    s.id === suggestionId ? { ...s, status: 'rejected' } : s,
  );

  await prisma.project.update({
    where: { id: projectId },
    data: { suggestions: updated as unknown as Prisma.InputJsonValue },
  });

  return Response.json({ suggestions: updated });
}
