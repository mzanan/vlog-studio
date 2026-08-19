import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { generateEdl, currentProvider, buildManualPrompt, ClipForPlanning } from '@/lib/llm';
import { loadVisionTags, visionTagForFilename } from '@/lib/chapters';
import { loadMomentScores, momentScoreForClip, bestWindowFor, describeMomentSignals } from '@/lib/momentScore';
import { LlmEdl, PlanInput, resolveLlmEdl, CutPreset, DEFAULT_CUT_PRESET, isValidCutPreset } from '@/lib/llm/prompts';
import { writeLlmLog, summarizeInput, renderedUserMessage } from '@/lib/llm/log';
import { Edl, buildDefaultEdl, isValidEdl } from '@/lib/edl';
import { loadProjectPlan } from '@/lib/project';
import { Suggestion, autoApplyBrollBestMoments, dropDuplicateAcceptedTrims } from '@/lib/suggestions';
import { diffEdls, buildSuggestionsFromDiff } from '@/lib/diff-edl';
import { sampleUserVoiceStyle } from '@/lib/voice-style';
import { populateMusicSections } from '@/lib/music-search';
import { updateProjectIfFresh, parseExpectedPlanVersion, staleWriteResponse } from '@/lib/concurrency';

async function loadPlanInput(projectId: string, cutPreset: CutPreset) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      clips: {
        orderBy: { createdAt: 'asc' },
        include: { segments: { orderBy: { wordIndex: 'asc' } } },
      },
    },
  });
  if (!project) return { error: 'project not found', status: 404 as const };

  const untranscribed = project.clips.filter((c) => !c.transcribedAt);
  if (untranscribed.length > 0) {
    return { error: `${untranscribed.length} clips have not been transcribed yet`, status: 409 as const };
  }
  if (project.clips.length === 0) {
    return { error: 'The project has no clips', status: 409 as const };
  }

  let visionTags: Awaited<ReturnType<typeof loadVisionTags>> = [];
  try {
    visionTags = await loadVisionTags();
  } catch {
    visionTags = [];
  }

  let momentScores: Awaited<ReturnType<typeof loadMomentScores>> = [];
  try {
    momentScores = await loadMomentScores(projectId);
  } catch {
    momentScores = [];
  }

  const clips: ClipForPlanning[] = project.clips.map((c) => {
    const visionTag = c.hasVoice ? undefined : visionTagForFilename(c.filename, visionTags);
    const momentScore = c.hasVoice ? undefined : momentScoreForClip(c.id, momentScores);
    const bestWindow = momentScore ? bestWindowFor(momentScore) : undefined;
    const bestMoment = bestWindow
      ? {
          inMs: bestWindow.startMs,
          outMs: bestWindow.endMs,
          reason: momentScore?.pick?.reason ?? describeMomentSignals(bestWindow.signals),
        }
      : undefined;
    return {
      id: c.id,
      filename: c.filename,
      kind: c.hasVoice ? 'a-camara' : 'b-roll',
      durationMs: c.durationMs,
      words: c.hasVoice
        ? c.segments.map((s) => ({
            wordIndex: s.wordIndex,
            startMs: s.startMs,
            endMs: s.endMs,
            text: s.text,
          }))
        : [],
      visionTag,
      bestMoment,
    };
  });

  const voiceStyleSamples = await sampleUserVoiceStyle(projectId);

  const input: PlanInput = {
    intent: project.intent ?? '',
    targetDurationSec: project.targetDuration ?? null,
    clips,
    voiceStyleSamples,
    cutPreset,
  };

  return { project, input };
}

export async function GET(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/plan'>) {
  const { id: projectId } = await ctx.params;
  const url = new URL(req.url);

  if (url.searchParams.get('format') === 'prompt') {
    const presetRaw = url.searchParams.get('preset');
    const preset = isValidCutPreset(presetRaw) ? presetRaw : DEFAULT_CUT_PRESET;
    const loaded = await loadPlanInput(projectId, preset);
    if ('error' in loaded) return Response.json({ error: loaded.error }, { status: loaded.status });
    return new Response(buildManualPrompt(loaded.input), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const plan = await loadProjectPlan(projectId);
  if (!plan) {
    return Response.json({ provider: currentProvider(), edl: null, suggestions: [], isDefault: false, planVersion: null });
  }
  if (plan.edl) {
    return Response.json({ provider: currentProvider(), edl: plan.edl, suggestions: plan.suggestions, isDefault: false, planVersion: plan.planVersion });
  }

  const clips = await prisma.clip.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, durationMs: true, hasVoice: true },
  });
  if (clips.length === 0) {
    return Response.json({ provider: currentProvider(), edl: null, suggestions: plan.suggestions, isDefault: false, planVersion: plan.planVersion });
  }
  return Response.json({
    provider: currentProvider(),
    edl: buildDefaultEdl(clips),
    suggestions: plan.suggestions,
    isDefault: true,
    planVersion: plan.planVersion,
  });
}

// POST corre el LLM y genera suggestions diffeadas contra el edl actual.
// - Si no había edl: persiste buildDefaultEdl como base y diffea contra él.
// - Purga suggestions pendientes anteriores; conserva las accepted/rejected.
// - Body opcional `{ rawJson }` para modo manual (LLM_PROVIDER=manual).
export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/plan'>) {
  const { id: projectId } = await ctx.params;

  let body: { rawJson?: string; cutPreset?: string; expectedPlanVersion?: number } = {};
  try {
    body = (await req.json()) as { rawJson?: string; cutPreset?: string; expectedPlanVersion?: number };
  } catch {
    // sin body → flow automático
  }
  const expectedPlanVersion = parseExpectedPlanVersion(body);
  if (expectedPlanVersion === null) return Response.json({ error: 'missing expectedPlanVersion' }, { status: 400 });
  const cutPreset: CutPreset = isValidCutPreset(body.cutPreset) ? body.cutPreset : DEFAULT_CUT_PRESET;

  const loaded = await loadPlanInput(projectId, cutPreset);
  if ('error' in loaded) return Response.json({ error: loaded.error }, { status: loaded.status });

  const provider = currentProvider();
  const mode = typeof body.rawJson === 'string' ? 'manual' : 'auto';
  const startedAt = Date.now();
  let llmEdlForLog: LlmEdl | null = null;
  let resolvedLlmEdl: Edl | null = null;
  let errorForLog: string | null = null;

  try {
    if (typeof body.rawJson === 'string') {
      llmEdlForLog = JSON.parse(body.rawJson) as LlmEdl;
      resolvedLlmEdl = resolveLlmEdl(llmEdlForLog, loaded.input);
      if (!isValidEdl(resolvedLlmEdl)) {
        errorForLog = 'Manual JSON did not produce a valid EDL';
        return Response.json({ error: errorForLog }, { status: 400 });
      }
    } else {
      const result = await generateEdl(loaded.input);
      resolvedLlmEdl = result.edl;
      llmEdlForLog = result.llmEdl;
    }

    // Baseline edl: si no hay uno persistido, usamos el default en memoria
    // (se persiste recién en el write final de abajo, junto con las suggestions).
    const plan = await loadProjectPlan(projectId);
    const currentEdl: Edl = plan?.edl
      ?? buildDefaultEdl(loaded.project.clips.map((c) => ({ id: c.id, durationMs: c.durationMs, hasVoice: c.hasVoice })));

    const diff = diffEdls(currentEdl, resolvedLlmEdl);
    const newSuggestions = buildSuggestionsFromDiff(diff);

    const bestMomentByClip = new Map(
      loaded.input.clips.flatMap((c) =>
        c.bestMoment ? [[c.id, { inMs: c.bestMoment.inMs, outMs: c.bestMoment.outMs }] as const] : [],
      ),
    );
    const {
      edl: edlToPersist,
      pending: pendingSuggestions,
      autoApplied,
    } = autoApplyBrollBestMoments(currentEdl, newSuggestions, bestMomentByClip);

    const keptOlder = dropDuplicateAcceptedTrims(
      (plan?.suggestions ?? []).filter((s) => s.status !== 'pending'),
      autoApplied,
    );
    const allSuggestions: Suggestion[] = [...keptOlder, ...pendingSuggestions, ...autoApplied];

    let planVersion: number;
    try {
      planVersion = await updateProjectIfFresh(projectId, expectedPlanVersion, {
        edl: edlToPersist as unknown as Prisma.InputJsonValue,
        suggestions: allSuggestions as unknown as Prisma.InputJsonValue,
      });
    } catch (err) {
      const conflict = staleWriteResponse(err);
      if (conflict) {
        errorForLog = err instanceof Error ? err.message : String(err);
        return conflict;
      }
      throw err;
    }

    return Response.json({ edl: edlToPersist, suggestions: allSuggestions, generated: newSuggestions.length, planVersion });
  } catch (err) {
    errorForLog = err instanceof Error ? err.message : String(err);
    return Response.json({ error: errorForLog }, { status: 500 });
  } finally {
    await writeLlmLog({
      timestamp: new Date().toISOString(),
      projectId,
      provider,
      mode,
      durationMs: Date.now() - startedAt,
      inputSummary: summarizeInput(loaded.input),
      userMessage: renderedUserMessage(loaded.input),
      llmEdl: llmEdlForLog,
      resolvedEdl: resolvedLlmEdl,
      error: errorForLog,
    });
  }
}

// PATCH guarda ediciones manuales de la timeline del usuario.
// Si una section musical fue agregada/modificada sin trackId, la populamos.
export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/plan'>) {
  const { id: projectId } = await ctx.params;
  const body = await req.json();
  if (!isValidEdl(body?.edl)) return Response.json({ error: 'Invalid EDL' }, { status: 400 });
  const expectedPlanVersion = parseExpectedPlanVersion(body);
  if (expectedPlanVersion === null) return Response.json({ error: 'missing expectedPlanVersion' }, { status: 400 });
  const edl = body.edl as Edl;
  const needsMusicPopulate = edl.music.sections.some((s) => s.query && !s.trackId);
  if (needsMusicPopulate) await populateMusicSections(edl);
  let planVersion: number;
  try {
    planVersion = await updateProjectIfFresh(projectId, expectedPlanVersion, {
      edl: edl as unknown as Prisma.InputJsonValue,
    });
  } catch (err) {
    const conflict = staleWriteResponse(err);
    if (conflict) return conflict;
    throw err;
  }
  return Response.json({ edl, planVersion });
}
