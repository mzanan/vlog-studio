import { NextRequest } from 'next/server';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { voDir } from '@/lib/paths';
import { toWavMono48k } from '@/lib/ffmpeg';
import { serveFile } from '@/lib/http';

function masterWavPath(projectId: string) {
  return path.join(voDir(projectId), 'master.wav');
}

function masterWebmPath(projectId: string) {
  return path.join(voDir(projectId), 'master.webm');
}

export async function GET(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/vo'>) {
  const { id: projectId } = await ctx.params;
  return serveFile(
    masterWavPath(projectId),
    { contentType: 'audio/wav', cacheControl: 'private, no-cache' },
    req,
  );
}

export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/vo'>) {
  const { id: projectId } = await ctx.params;
  const form = await req.formData();
  const audio = form.get('audio');
  if (!(audio instanceof File)) return Response.json({ error: 'falta audio' }, { status: 400 });

  await mkdir(voDir(projectId), { recursive: true });
  const webm = masterWebmPath(projectId);
  const wav = masterWavPath(projectId);
  await writeFile(webm, Buffer.from(await audio.arrayBuffer()));
  await toWavMono48k(webm, wav);
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/vo'>) {
  const { id: projectId } = await ctx.params;
  await rm(masterWavPath(projectId), { force: true });
  await rm(masterWebmPath(projectId), { force: true });
  return Response.json({ ok: true });
}
