import { NextRequest } from 'next/server';
import { mkdir, readdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db';
import { INBOX_DIR, INBOX_IMPORTED_DIR, VIDEO_EXTENSIONS } from '@/lib/paths';
import { ingestClipFile } from '@/lib/ingest';

export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/clips/import-inbox'>) {
  const { id: projectId } = await ctx.params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return Response.json({ error: 'project not found' }, { status: 404 });

  try {
    await stat(INBOX_DIR);
  } catch {
    return Response.json({ error: `Inbox no existe en ${INBOX_DIR}` }, { status: 404 });
  }

  await mkdir(INBOX_IMPORTED_DIR, { recursive: true });

  const entries = await readdir(INBOX_DIR, { withFileTypes: true });
  const candidates = entries
    .filter((e) => e.isFile() && VIDEO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(INBOX_DIR, e.name));

  const imported: string[] = [];
  const failed: { file: string; error: string }[] = [];

  for (const sourcePath of candidates) {
    const originalName = path.basename(sourcePath);
    try {
      await ingestClipFile(projectId, sourcePath, originalName, req.signal);
      await rename(sourcePath, path.join(INBOX_IMPORTED_DIR, originalName));
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
