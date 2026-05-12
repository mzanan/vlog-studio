import { NextRequest } from 'next/server';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { isValidEdl } from '@/lib/edl';
import { isValidMusicBlocks, musicDir, MusicBlock } from '@/lib/music';
import { blockDurationMs, buildPrompt, runMusicgen } from '@/lib/musicgen';

export const maxDuration = 600;

export async function POST(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/music/[blockId]/generate'>) {
  const { id: projectId, blockId } = await ctx.params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return Response.json({ error: 'project not found' }, { status: 404 });
  if (!isValidEdl(project.edl)) return Response.json({ error: 'project sin EDL' }, { status: 409 });
  if (!isValidMusicBlocks(project.musicBlocks)) return Response.json({ error: 'sin music blocks' }, { status: 409 });

  const blocks = project.musicBlocks as MusicBlock[];
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return Response.json({ error: 'block not found' }, { status: 404 });

  const durationMs = blockDurationMs(block, project.edl);
  const durationSec = Math.max(5, Math.min(120, Math.ceil(durationMs / 1000)));
  const prompt = buildPrompt(block);

  const dir = musicDir(projectId);
  await mkdir(dir, { recursive: true });
  const ext = '.wav';
  const dest = path.join(dir, `${block.id}${ext}`);

  if (block.audioExt && block.audioExt !== ext) {
    try {
      await stat(path.join(dir, `${block.id}${block.audioExt}`));
      await rm(path.join(dir, `${block.id}${block.audioExt}`));
    } catch {
      // ignore
    }
  }

  try {
    await runMusicgen(prompt, durationSec, dest);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `MusicGen falló: ${message}` }, { status: 500 });
  }

  const updated = blocks.map((b) => (b.id === blockId ? { ...b, audioExt: ext } : b));
  await prisma.project.update({
    where: { id: projectId },
    data: { musicBlocks: updated as unknown as Prisma.InputJsonValue },
  });

  return Response.json({ blocks: updated, prompt, durationSec });
}
