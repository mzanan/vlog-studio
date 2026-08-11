import { NextRequest } from 'next/server';
import { Prisma } from '@/lib/generated/prisma/client';
import { loadProjectPlan } from '@/lib/project';
import { Suggestion } from '@/lib/suggestions';
import { updateProjectIfFresh, StaleWriteError } from '@/lib/concurrency';

export async function POST(
  req: NextRequest,
  ctx: RouteContext<'/api/projects/[id]/suggestions/[suggestionId]/reject'>,
) {
  const { id: projectId, suggestionId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { expectedPlanVersion?: number };
  if (!Number.isInteger(body.expectedPlanVersion) || (body.expectedPlanVersion as number) < 0) {
    return Response.json({ error: 'falta expectedPlanVersion' }, { status: 400 });
  }

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

  let planVersion: number;
  try {
    planVersion = await updateProjectIfFresh(projectId, body.expectedPlanVersion as number, {
      suggestions: updated as unknown as Prisma.InputJsonValue,
    });
  } catch (err) {
    if (err instanceof StaleWriteError) return Response.json({ error: err.message, conflict: true }, { status: 409 });
    throw err;
  }

  return Response.json({ suggestions: updated, planVersion });
}
