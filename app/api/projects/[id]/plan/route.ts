import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { generateEdl, currentProvider, buildManualPrompt, ClipForPlanning } from '@/lib/llm';
import { Edl, isValidEdl } from '@/lib/edl';

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

  return {
    project,
    input: {
      intent: project.intent ?? '',
      targetDurationSec: project.targetDuration ?? null,
      clips,
    },
  };
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

  let edl: Edl | null = null;
  if (isValidEdl(body?.edl)) {
    edl = body.edl;
  } else if (typeof body?.rawJson === 'string') {
    try {
      const parsed = JSON.parse(body.rawJson);
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const candidate: Edl = {
        segments: parsed.segments,
        musicHints: parsed.musicHints,
        intent: project?.intent ?? '',
        targetDurationSec: project?.targetDuration ?? null,
        generatedAt: new Date().toISOString(),
      };
      if (isValidEdl(candidate)) edl = candidate;
    } catch {
      // fallthrough to 400 below
    }
  }

  if (!edl) return Response.json({ error: 'EDL inválido' }, { status: 400 });

  await prisma.project.update({
    where: { id: projectId },
    data: { edl: edl as unknown as Prisma.InputJsonValue },
  });
  return Response.json({ edl });
}
