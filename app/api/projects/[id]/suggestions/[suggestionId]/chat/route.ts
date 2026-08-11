import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { loadProjectPlan } from '@/lib/project';
import { ChatMessage, Suggestion } from '@/lib/suggestions';
import { refineSuggestion, mergeUpdatedPayload, ClipContext } from '@/lib/llm/refine';
import { updateProjectIfFresh, StaleWriteError } from '@/lib/concurrency';

type ChatBody = { message: string; expectedPlanVersion: number };

export async function POST(
  req: NextRequest,
  ctx: RouteContext<'/api/projects/[id]/suggestions/[suggestionId]/chat'>,
) {
  const { id: projectId, suggestionId } = await ctx.params;
  const body = (await req.json()) as Partial<ChatBody>;
  if (!body.message || typeof body.message !== 'string' || body.message.trim() === '') {
    return Response.json({ error: 'message vacío' }, { status: 400 });
  }
  if (!Number.isInteger(body.expectedPlanVersion) || (body.expectedPlanVersion as number) < 0) {
    return Response.json({ error: 'falta expectedPlanVersion' }, { status: 400 });
  }
  const userMessage = body.message.trim();

  const plan = await loadProjectPlan(projectId);
  if (!plan?.edl) return Response.json({ error: 'project sin edl' }, { status: 409 });

  const idx = plan.suggestions.findIndex((s) => s.id === suggestionId);
  if (idx < 0) return Response.json({ error: 'suggestion not found' }, { status: 404 });
  const target = plan.suggestions[idx];
  if (target.status !== 'pending') {
    return Response.json({ error: `suggestion ya está ${target.status}` }, { status: 409 });
  }

  // Cargar contexto de clips relevantes (solo los que la sugerencia toca).
  const relevantClipIds = new Set<string>();
  if (target.type === 'trim-segment' || target.type === 'split-segment') {
    const seg = plan.edl.segments.find((s) => s.id === target.data.segmentId);
    if (seg) relevantClipIds.add(seg.clipId);
  } else if (target.type === 'hide-clip') {
    relevantClipIds.add(target.data.clipId);
  }

  const clipContexts: Record<string, ClipContext> = {};
  if (relevantClipIds.size > 0) {
    const clipsDb = await prisma.clip.findMany({
      where: { id: { in: [...relevantClipIds] } },
      include: { segments: { orderBy: { wordIndex: 'asc' } } },
    });
    for (const c of clipsDb) {
      clipContexts[c.id] = {
        id: c.id,
        filename: c.filename,
        durationMs: c.durationMs,
        words: c.segments.map((s) => ({
          wordIndex: s.wordIndex,
          startMs: s.startMs,
          endMs: s.endMs,
          text: s.text,
        })),
      };
    }
  }

  let result;
  try {
    result = await refineSuggestion({
      suggestion: target,
      edl: plan.edl,
      clipContexts,
      userMessage,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }

  const userChatEntry: ChatMessage = {
    role: 'user',
    content: userMessage,
    timestamp: new Date().toISOString(),
  };
  const assistantChatEntry: ChatMessage = {
    role: 'assistant',
    content: result.reply,
    timestamp: new Date().toISOString(),
  };
  const newChat: ChatMessage[] = [...(target.chat ?? []), userChatEntry, assistantChatEntry];

  let mergedData = target.data as unknown as Record<string, unknown>;
  let rationale = target.rationale;
  if (result.updatedPayload) {
    mergedData = mergeUpdatedPayload(target.type, mergedData, result.updatedPayload);
    rationale = `${rationale} · refinado vía chat`;
  }

  const updated: Suggestion = {
    ...target,
    data: mergedData as never,
    chat: newChat,
    rationale,
  };

  const newList = [...plan.suggestions];
  newList[idx] = updated;

  let planVersion: number;
  try {
    planVersion = await updateProjectIfFresh(projectId, body.expectedPlanVersion as number, {
      suggestions: newList as unknown as Prisma.InputJsonValue,
    });
  } catch (err) {
    if (err instanceof StaleWriteError) return Response.json({ error: err.message, conflict: true }, { status: 409 });
    throw err;
  }

  return Response.json({
    suggestion: updated,
    suggestions: newList,
    reply: result.reply,
    updatedPayload: result.updatedPayload,
    planVersion,
  });
}
