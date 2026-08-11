import { NextRequest } from 'next/server';
import { Prisma } from '@/lib/generated/prisma/client';
import { loadProjectPlan } from '@/lib/project';
import { applySuggestion, Suggestion, SuggestionApplyError } from '@/lib/suggestions';
import { populateMusicSections } from '@/lib/music-search';
import { updateProjectIfFresh, StaleWriteError } from '@/lib/concurrency';

const MUSIC_TYPES = new Set(['add-music-section', 'replace-music-track']);

export async function POST(
  req: NextRequest,
  ctx: RouteContext<'/api/projects/[id]/suggestions/[suggestionId]/accept'>,
) {
  const { id: projectId, suggestionId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { expectedPlanVersion?: number };
  if (!Number.isInteger(body.expectedPlanVersion) || (body.expectedPlanVersion as number) < 0) {
    return Response.json({ error: 'falta expectedPlanVersion' }, { status: 400 });
  }
  const expectedPlanVersion = body.expectedPlanVersion as number;

  const plan = await loadProjectPlan(projectId);
  if (!plan) return Response.json({ error: 'project not found' }, { status: 404 });
  if (!plan.edl) return Response.json({ error: 'project sin edl' }, { status: 409 });

  const target = plan.suggestions.find((s) => s.id === suggestionId);
  if (!target) return Response.json({ error: 'suggestion not found' }, { status: 404 });
  if (target.status !== 'pending') {
    return Response.json({ error: `suggestion ya está ${target.status}` }, { status: 409 });
  }

  let newEdl;
  try {
    newEdl = applySuggestion(plan.edl, target);
  } catch (err) {
    if (err instanceof SuggestionApplyError && err.reason === 'stale-target') {
      const updated = plan.suggestions.map((s): Suggestion =>
        s.id === suggestionId ? { ...s, status: 'stale' } : s,
      );
      try {
        const planVersion = await updateProjectIfFresh(projectId, expectedPlanVersion, {
          suggestions: updated as unknown as Prisma.InputJsonValue,
        });
        return Response.json({ error: err.message, suggestion: 'stale', suggestions: updated, planVersion }, { status: 409 });
      } catch (staleErr) {
        if (staleErr instanceof StaleWriteError) {
          return Response.json({ error: staleErr.message, conflict: true }, { status: 409 });
        }
        throw staleErr;
      }
    }
    throw err;
  }

  if (MUSIC_TYPES.has(target.type)) {
    await populateMusicSections(newEdl);
  }

  const updated = plan.suggestions.map((s): Suggestion =>
    s.id === suggestionId ? { ...s, status: 'accepted' } : s,
  );

  let planVersion: number;
  try {
    planVersion = await updateProjectIfFresh(projectId, expectedPlanVersion, {
      edl: newEdl as unknown as Prisma.InputJsonValue,
      suggestions: updated as unknown as Prisma.InputJsonValue,
    });
  } catch (err) {
    if (err instanceof StaleWriteError) return Response.json({ error: err.message, conflict: true }, { status: 409 });
    throw err;
  }

  return Response.json({ edl: newEdl, suggestions: updated, planVersion });
}
