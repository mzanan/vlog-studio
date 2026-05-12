import { NextRequest } from 'next/server';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { Prisma } from '@/lib/generated/prisma/client';
import { isValidMusicBlocks, musicDir, MusicBlock } from '@/lib/music';

const AUDIO_EXT_ALLOWLIST = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);

async function loadBlocks(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  if (!isValidMusicBlocks(project.musicBlocks)) return null;
  return { project, blocks: project.musicBlocks as MusicBlock[] };
}

function findBlock(blocks: MusicBlock[], blockId: string): MusicBlock | null {
  return blocks.find((b) => b.id === blockId) ?? null;
}

export async function GET(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/music/[blockId]/audio'>) {
  const { id: projectId, blockId } = await ctx.params;
  const loaded = await loadBlocks(projectId);
  if (!loaded) return new Response('not found', { status: 404 });
  const block = findBlock(loaded.blocks, blockId);
  if (!block?.audioExt) return new Response('not found', { status: 404 });

  const filePath = path.join(musicDir(projectId), `${block.id}${block.audioExt}`);
  try {
    const buf = await readFile(filePath);
    const contentType = block.audioExt === '.mp3' ? 'audio/mpeg' :
      block.audioExt === '.wav' ? 'audio/wav' :
      block.audioExt === '.m4a' || block.audioExt === '.aac' ? 'audio/aac' :
      block.audioExt === '.ogg' ? 'audio/ogg' :
      block.audioExt === '.flac' ? 'audio/flac' :
      'application/octet-stream';
    const v = req.nextUrl.searchParams.get('v') ?? '0';
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': v === '0' ? 'no-store' : 'public, max-age=300',
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/music/[blockId]/audio'>) {
  const { id: projectId, blockId } = await ctx.params;
  const loaded = await loadBlocks(projectId);
  if (!loaded) return Response.json({ error: 'project or blocks not found' }, { status: 404 });
  const block = findBlock(loaded.blocks, blockId);
  if (!block) return Response.json({ error: 'block not found' }, { status: 404 });

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'file required' }, { status: 400 });

  const ext = path.extname(file.name).toLowerCase();
  if (!AUDIO_EXT_ALLOWLIST.has(ext)) {
    return Response.json({ error: `Extensión no soportada: ${ext}` }, { status: 400 });
  }

  const dir = musicDir(projectId);
  await mkdir(dir, { recursive: true });

  if (block.audioExt && block.audioExt !== ext) {
    try {
      await rm(path.join(dir, `${block.id}${block.audioExt}`));
    } catch {
      // ignore
    }
  }

  const dest = path.join(dir, `${block.id}${ext}`);
  await writeFile(dest, Buffer.from(await file.arrayBuffer()));

  const updated = loaded.blocks.map((b) => (b.id === blockId ? { ...b, audioExt: ext } : b));
  await prisma.project.update({
    where: { id: projectId },
    data: { musicBlocks: updated as unknown as Prisma.InputJsonValue },
  });

  return Response.json({ blocks: updated }, { status: 201 });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/music/[blockId]/audio'>) {
  const { id: projectId, blockId } = await ctx.params;
  const loaded = await loadBlocks(projectId);
  if (!loaded) return Response.json({ error: 'project or blocks not found' }, { status: 404 });
  const block = findBlock(loaded.blocks, blockId);
  if (!block) return Response.json({ error: 'block not found' }, { status: 404 });

  if (block.audioExt) {
    try {
      await stat(path.join(musicDir(projectId), `${block.id}${block.audioExt}`));
      await rm(path.join(musicDir(projectId), `${block.id}${block.audioExt}`));
    } catch {
      // ignore
    }
  }

  const updated = loaded.blocks.map((b) => (b.id === blockId ? { ...b, audioExt: null } : b));
  await prisma.project.update({
    where: { id: projectId },
    data: { musicBlocks: updated as unknown as Prisma.InputJsonValue },
  });

  return Response.json({ blocks: updated });
}
