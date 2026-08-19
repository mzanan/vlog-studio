import { NextRequest } from 'next/server';
import { Prisma } from '@/lib/generated/prisma/client';
import { loadProjectPlan } from '@/lib/project';
import { Suggestion } from '@/lib/suggestions';
import { updateProjectIfFresh, parseExpectedPlanVersion, staleWriteResponse } from '@/lib/concurrency';

export async function POST(
  req: NextRequest,
  ctx: RouteContext<'/api/projects/[id]/suggestions/[suggestionId]/reject'>,
) {
  const { id: projectId, suggestionId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const expectedPlanVersion = parseExpectedPlanVersion(body);
  if (expectedPlanVersion === null) return Response.json({ error: 'missing expectedPlanVersion' }, { status: 400 });

  const plan = await loadProjectPlan(projectId);
  if (!plan) return Response.json({ error: 'project not found' }, { status: 404 });

  const target = plan.suggestions.find((s) => s.id === suggestionId);
  if (!target) return Response.json({ error: 'suggestion not found' }, { status: 404 });
  if (target.status !== 'pending') {
    return Response.json({ error: `suggestion is already ${target.status}` }, { status: 409 });
  }

  const updated = plan.suggestions.map((s): Suggestion =>
    s.id === suggestionId ? { ...s, status: 'rejected' } : s,
  );

  let planVersion: number;
  try {
    planVersion = await updateProjectIfFresh(projectId, expectedPlanVersion, {
      suggestions: updated as unknown as Prisma.InputJsonValue,
    });
  } catch (err) {
    const conflict = staleWriteResponse(err);
    if (conflict) return conflict;
    throw err;
  }

  return Response.json({ suggestions: updated, planVersion });
}
