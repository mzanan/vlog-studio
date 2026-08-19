import { NextRequest } from 'next/server';
import { Prisma } from '@/lib/generated/prisma/client';
import { loadProjectPlan } from '@/lib/project';
import { Edl } from '@/lib/edl';
import { applySuggestion, Suggestion, SuggestionApplyError } from '@/lib/suggestions';
import { populateMusicSections } from '@/lib/music-search';
import { updateProjectIfFresh, parseExpectedPlanVersion, staleWriteResponse } from '@/lib/concurrency';

const MUSIC_TYPES = new Set(['add-music-section', 'replace-music-track']);

type BulkBody = {
  ids: string[];
  action: 'accept' | 'reject';
  expectedPlanVersion: number;
};

export async function POST(
  req: NextRequest,
  ctx: RouteContext<'/api/projects/[id]/suggestions/bulk'>,
) {
  const { id: projectId } = await ctx.params;
  const body = (await req.json()) as Partial<BulkBody>;
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return Response.json({ error: 'empty ids' }, { status: 400 });
  }
  if (body.action !== 'accept' && body.action !== 'reject') {
    return Response.json({ error: 'invalid action' }, { status: 400 });
  }
  const expectedPlanVersion = parseExpectedPlanVersion(body);
  if (expectedPlanVersion === null) return Response.json({ error: 'missing expectedPlanVersion' }, { status: 400 });

  const plan = await loadProjectPlan(projectId);
  if (!plan) return Response.json({ error: 'project not found' }, { status: 404 });

  const targetSet = new Set(body.ids);
  const results: Array<{ id: string; status: 'accepted' | 'rejected' | 'stale' | 'skipped' }> = [];

  if (body.action === 'reject') {
    const updated = plan.suggestions.map((s): Suggestion => {
      if (!targetSet.has(s.id)) return s;
      if (s.status !== 'pending') {
        results.push({ id: s.id, status: 'skipped' });
        return s;
      }
      results.push({ id: s.id, status: 'rejected' });
      return { ...s, status: 'rejected' };
    });
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
    return Response.json({ suggestions: updated, results, planVersion });
  }

  if (!plan.edl) return Response.json({ error: 'project without edl' }, { status: 409 });

  let workingEdl: Edl = plan.edl;
  let touchedMusic = false;
  const updatedSuggestions: Suggestion[] = [...plan.suggestions];

  // Acepto suggestions en el orden en que aparecen para mantener intención editorial.
  // Si alguna queda stale (porque otra la invalidó), se marca y se sigue.
  for (let i = 0; i < updatedSuggestions.length; i++) {
    const s = updatedSuggestions[i];
    if (!targetSet.has(s.id)) continue;
    if (s.status !== 'pending') {
      results.push({ id: s.id, status: 'skipped' });
      continue;
    }
    try {
      workingEdl = applySuggestion(workingEdl, s);
      updatedSuggestions[i] = { ...s, status: 'accepted' };
      if (MUSIC_TYPES.has(s.type)) touchedMusic = true;
      results.push({ id: s.id, status: 'accepted' });
    } catch (err) {
      if (err instanceof SuggestionApplyError && err.reason === 'stale-target') {
        updatedSuggestions[i] = { ...s, status: 'stale' };
        results.push({ id: s.id, status: 'stale' });
        continue;
      }
      throw err;
    }
  }

  if (touchedMusic) await populateMusicSections(workingEdl);

  let planVersion: number;
  try {
    planVersion = await updateProjectIfFresh(projectId, expectedPlanVersion, {
      edl: workingEdl as unknown as Prisma.InputJsonValue,
      suggestions: updatedSuggestions as unknown as Prisma.InputJsonValue,
    });
  } catch (err) {
    const conflict = staleWriteResponse(err);
    if (conflict) return conflict;
    throw err;
  }

  return Response.json({ edl: workingEdl, suggestions: updatedSuggestions, results, planVersion });
}
