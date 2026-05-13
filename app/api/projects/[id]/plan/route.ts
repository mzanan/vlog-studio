import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { generateEdl, currentProvider, buildManualPrompt, ClipForPlanning } from '@/lib/llm';
import { LlmEdl, PlanInput, resolveLlmEdl } from '@/lib/llm/prompts';
import { Edl, buildDefaultEdl, isValidEdl } from '@/lib/edl';
import { loadProjectEdls } from '@/lib/project';
import { sampleUserVoiceStyle } from '@/lib/voice-style';
import { populateMusicSections } from '@/lib/music-search';

async function loadPlanInput(projectId: string) {
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
    return { error: `Hay ${untranscribed.length} clips sin transcribir`, status: 409 as const };
  }
  if (project.clips.length === 0) {
    return { error: 'El proyecto no tiene clips', status: 409 as const };
  }

  const clips: ClipForPlanning[] = project.clips.map((c) => ({
    id: c.id,
    filename: c.filename,
    kind: c.hasVoice ? 'a-camara' : 'b-roll',
    durationMs: c.durationMs,
    transcript: c.segments.map((s) => s.text).join(' '),
  }));

  const voiceStyleSamples = await sampleUserVoiceStyle(projectId);

  const input: PlanInput = {
    intent: project.intent ?? '',
    targetDurationSec: project.targetDuration ?? null,
    clips,
    voiceStyleSamples,
  };

  return { project, input };
}

async function persistSuggestion(projectId: string, suggestion: Edl) {
  await populateMusicSections(suggestion);
  await prisma.project.update({
    where: { id: projectId },
    data: { edlSuggestion: suggestion as unknown as Prisma.InputJsonValue },
  });
}

export async function GET(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/plan'>) {
  const { id: projectId } = await ctx.params;
  const url = new URL(req.url);

  if (url.searchParams.get('format') === 'prompt') {
    const loaded = await loadPlanInput(projectId);
    if ('error' in loaded) return Response.json({ error: loaded.error }, { status: loaded.status });
    return new Response(buildManualPrompt(loaded.input), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const edls = await loadProjectEdls(projectId);
  if (!edls) {
    return Response.json({ provider: currentProvider(), edl: null, suggestion: null, isDefault: false });
  }
  if (edls.edl) {
    return Response.json({ provider: currentProvider(), edl: edls.edl, suggestion: edls.suggestion, isDefault: false });
  }

  const clips = await prisma.clip.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, durationMs: true },
  });
  if (clips.length === 0) {
    return Response.json({ provider: currentProvider(), edl: null, suggestion: edls.suggestion, isDefault: false });
  }
  return Response.json({
    provider: currentProvider(),
    edl: buildDefaultEdl(clips),
    suggestion: edls.suggestion,
    isDefault: true,
  });
}

// POST genera la sugerencia AI. Sin body → usa el provider configurado (Gemini
// por default). Con `{ rawJson }` → parsea como LlmEdl y resuelve (modo manual
// para `LLM_PROVIDER=manual`: el user pega el JSON producido por Claude Code).
export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/plan'>) {
  const { id: projectId } = await ctx.params;
  const loaded = await loadPlanInput(projectId);
  if ('error' in loaded) return Response.json({ error: loaded.error }, { status: loaded.status });

  let body: { rawJson?: string } = {};
  try {
    body = (await req.json()) as { rawJson?: string };
  } catch {
    // sin body → flow automático
  }

  try {
    let suggestion: Edl;
    if (typeof body.rawJson === 'string') {
      const llm = JSON.parse(body.rawJson) as LlmEdl;
      suggestion = resolveLlmEdl(llm, loaded.input);
      if (!isValidEdl(suggestion)) {
        return Response.json({ error: 'JSON manual no produjo un EDL válido' }, { status: 400 });
      }
    } else {
      suggestion = await generateEdl(loaded.input);
    }
    await persistSuggestion(projectId, suggestion);
    return Response.json({ suggestion });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

// PATCH guarda ediciones manuales de la timeline del usuario.
export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/plan'>) {
  const { id: projectId } = await ctx.params;
  const body = await req.json();
  if (!isValidEdl(body?.edl)) return Response.json({ error: 'EDL inválido' }, { status: 400 });
  await prisma.project.update({
    where: { id: projectId },
    data: { edl: body.edl as unknown as Prisma.InputJsonValue },
  });
  return Response.json({ edl: body.edl });
}
