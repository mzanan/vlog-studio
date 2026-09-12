import { NextRequest } from 'next/server';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { collectVideoFiles } from '@/lib/fs-browse';
import { ingestClipFile } from '@/lib/ingest';
import { whisperUnavailableResponse } from '@/lib/whisper-bin';

export const maxDuration = 1800;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/clips/import-paths'>) {
  const { id: projectId } = await ctx.params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return Response.json({ error: 'project not found' }, { status: 404 });

  const unavailable = whisperUnavailableResponse();
  if (unavailable) return unavailable;

  const body = await req.json().catch(() => ({}));
  const requested: unknown = body?.paths;
  if (!Array.isArray(requested) || requested.some((p) => typeof p !== 'string') || requested.length === 0) {
    return Response.json({ error: 'paths must be a non-empty array of strings' }, { status: 400 });
  }

  let candidates: string[];
  try {
    candidates = await collectVideoFiles(requested as string[]);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }

  if (candidates.length === 0) {
    return Response.json({ imported: 0, failed: [], files: [] }, { status: 200 });
  }

  const imported: string[] = [];
  const failed: { file: string; error: string }[] = [];

  for (const sourcePath of candidates) {
    const originalName = path.basename(sourcePath);
    try {
      await ingestClipFile(projectId, sourcePath, originalName, req.signal);
      imported.push(originalName);
    } catch (err) {
      failed.push({ file: originalName, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (imported.length > 0) {
    await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
  }

  return Response.json({ imported: imported.length, failed, files: imported }, { status: 201 });
}
