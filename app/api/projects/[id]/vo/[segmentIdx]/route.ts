import { NextRequest } from 'next/server';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { voDir } from '@/lib/paths';
import { probeDurationMs, toWavMono48k } from '@/lib/ffmpeg';

type Meta = { durationMs: number; recordedAt: string };

function paths(projectId: string, segmentIdx: number) {
  const dir = voDir(projectId);
  const base = `seg-${segmentIdx}`;
  return {
    dir,
    webm: path.join(dir, `${base}.webm`),
    wav: path.join(dir, `${base}.wav`),
    meta: path.join(dir, `${base}.meta.json`),
  };
}

async function readMeta(metaPath: string): Promise<Meta | null> {
  try {
    return JSON.parse(await readFile(metaPath, 'utf8')) as Meta;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/vo/[segmentIdx]'>) {
  const { id: projectId, segmentIdx } = await ctx.params;
  const idx = Number(segmentIdx);
  if (!Number.isInteger(idx) || idx < 0) {
    return Response.json({ error: 'segmentIdx inválido' }, { status: 400 });
  }

  const p = paths(projectId, idx);
  const url = new URL(req.url);

  if (url.searchParams.get('audio') === '1') {
    try {
      const buf = await readFile(p.webm);
      return new Response(new Uint8Array(buf), {
        headers: { 'Content-Type': 'audio/webm', 'Cache-Control': 'no-store' },
      });
    } catch {
      return new Response('not found', { status: 404 });
    }
  }

  const meta = await readMeta(p.meta);
  if (!meta) return Response.json({ recorded: false });
  return Response.json({ recorded: true, ...meta });
}

export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/vo/[segmentIdx]'>) {
  const { id: projectId, segmentIdx } = await ctx.params;
  const idx = Number(segmentIdx);
  if (!Number.isInteger(idx) || idx < 0) {
    return Response.json({ error: 'segmentIdx inválido' }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return Response.json({ error: 'project not found' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'file required' }, { status: 400 });

  const p = paths(projectId, idx);
  await mkdir(p.dir, { recursive: true });
  await writeFile(p.webm, Buffer.from(await file.arrayBuffer()));

  try {
    await toWavMono48k(p.webm, p.wav);
  } catch (err) {
    return Response.json(
      { error: `Falló conversión a WAV: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  const durationMs = await probeDurationMs(p.wav);
  const meta: Meta = { durationMs, recordedAt: new Date().toISOString() };
  await writeFile(p.meta, JSON.stringify(meta, null, 2));

  return Response.json({ recorded: true, ...meta }, { status: 201 });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/vo/[segmentIdx]'>) {
  const { id: projectId, segmentIdx } = await ctx.params;
  const idx = Number(segmentIdx);
  if (!Number.isInteger(idx) || idx < 0) {
    return Response.json({ error: 'segmentIdx inválido' }, { status: 400 });
  }

  const p = paths(projectId, idx);
  for (const f of [p.webm, p.wav, p.meta]) {
    try {
      await stat(f);
      await rm(f);
    } catch {
      // ignore
    }
  }

  return Response.json({ deleted: true });
}
