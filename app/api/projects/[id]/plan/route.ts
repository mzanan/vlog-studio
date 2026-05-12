import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { generateEdl, currentProvider, buildManualPrompt, ClipForPlanning } from '@/lib/llm';
import { LlmEdl, PlanInput, resolveLlmEdl } from '@/lib/llm/prompts';
import { isValidEdl } from '@/lib/edl';
import { sampleUserVoiceStyle } from '@/lib/voice-style';

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

  return Response.json({ provider: currentProvider() });
}

export async function POST(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/plan'>) {
  const { id: projectId } = await ctx.params;
  const loaded = await loadPlanInput(projectId);
  if ('error' in loaded) return Response.json({ error: loaded.error }, { status: loaded.status });

  try {
    const edl = await generateEdl(loaded.input);
    await prisma.project.update({
      where: { id: projectId },
      data: { edl: edl as unknown as Prisma.InputJsonValue },
    });
    return Response.json({ edl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/plan'>) {
  const { id: projectId } = await ctx.params;
  const body = await req.json();

  // Path 1: ya viene un Edl v2 válido (UI edit guardando cambios).
  if (isValidEdl(body?.edl)) {
    await prisma.project.update({
      where: { id: projectId },
      data: { edl: body.edl as unknown as Prisma.InputJsonValue },
    });
    return Response.json({ edl: body.edl });
  }

  // Path 2: paste manual de LlmEdl desde Claude Code → resolver acá.
  if (typeof body?.rawJson === 'string') {
    try {
      const llm = JSON.parse(body.rawJson) as LlmEdl;
      const loaded = await loadPlanInput(projectId);
      if ('error' in loaded) return Response.json({ error: loaded.error }, { status: loaded.status });
      const edl = resolveLlmEdl(llm, loaded.input);
      if (!isValidEdl(edl)) return Response.json({ error: 'JSON manual no produjo un EDL válido' }, { status: 400 });
      await prisma.project.update({
        where: { id: projectId },
        data: { edl: edl as unknown as Prisma.InputJsonValue },
      });
      return Response.json({ edl });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'JSON inválido';
      return Response.json({ error: message }, { status: 400 });
    }
  }

  return Response.json({ error: 'EDL inválido' }, { status: 400 });
}
