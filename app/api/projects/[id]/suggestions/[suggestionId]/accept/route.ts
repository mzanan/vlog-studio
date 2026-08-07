import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { loadProjectPlan } from '@/lib/project';
import { applySuggestion, Suggestion, SuggestionApplyError } from '@/lib/suggestions';
import { populateMusicSections } from '@/lib/music-search';

const MUSIC_TYPES = new Set(['add-music-section', 'replace-music-track']);

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<'/api/projects/[id]/suggestions/[suggestionId]/accept'>,
) {
  const { id: projectId, suggestionId } = await ctx.params;
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
      await prisma.project.update({
        where: { id: projectId },
        data: { suggestions: updated as unknown as Prisma.InputJsonValue },
      });
      return Response.json({ error: err.message, suggestion: 'stale' }, { status: 409 });
    }
    throw err;
  }

  if (MUSIC_TYPES.has(target.type)) {
    await populateMusicSections(newEdl);
  }

  const updated = plan.suggestions.map((s): Suggestion =>
    s.id === suggestionId ? { ...s, status: 'accepted' } : s,
  );

  await prisma.project.update({
    where: { id: projectId },
    data: {
      edl: newEdl as unknown as Prisma.InputJsonValue,
      suggestions: updated as unknown as Prisma.InputJsonValue,
    },
  });

  return Response.json({ edl: newEdl, suggestions: updated });
}
