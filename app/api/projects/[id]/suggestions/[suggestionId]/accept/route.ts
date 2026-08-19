import { NextRequest } from 'next/server';
import { Prisma } from '@/lib/generated/prisma/client';
import { loadProjectPlan } from '@/lib/project';
import { applySuggestion, Suggestion, SuggestionApplyError } from '@/lib/suggestions';
import { populateMusicSections } from '@/lib/music-search';
import { updateProjectIfFresh, parseExpectedPlanVersion, staleWriteResponse } from '@/lib/concurrency';

const MUSIC_TYPES = new Set(['add-music-section', 'replace-music-track']);

export async function POST(
  req: NextRequest,
  ctx: RouteContext<'/api/projects/[id]/suggestions/[suggestionId]/accept'>,
) {
  const { id: projectId, suggestionId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const expectedPlanVersion = parseExpectedPlanVersion(body);
  if (expectedPlanVersion === null) return Response.json({ error: 'missing expectedPlanVersion' }, { status: 400 });

  const plan = await loadProjectPlan(projectId);
  if (!plan) return Response.json({ error: 'project not found' }, { status: 404 });
  if (!plan.edl) return Response.json({ error: 'project without edl' }, { status: 409 });

  const target = plan.suggestions.find((s) => s.id === suggestionId);
  if (!target) return Response.json({ error: 'suggestion not found' }, { status: 404 });
  if (target.status !== 'pending') {
    return Response.json({ error: `suggestion is already ${target.status}` }, { status: 409 });
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
        const conflict = staleWriteResponse(staleErr);
        if (conflict) return conflict;
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
    const conflict = staleWriteResponse(err);
    if (conflict) return conflict;
    throw err;
  }

  return Response.json({ edl: newEdl, suggestions: updated, planVersion });
}
