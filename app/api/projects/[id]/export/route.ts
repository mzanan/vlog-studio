import { NextRequest } from 'next/server';
import path from 'node:path';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { prisma } from '@/lib/db';
import { isValidEdl } from '@/lib/edl';
import { projectDir } from '@/lib/paths';
import { buildVlogProps } from '@/lib/render-props';
import { renderVlog } from '@/lib/render';
import { getBaseUrl } from '@/lib/http';

export const maxDuration = 1800;
export const dynamic = 'force-dynamic';

function exportsDir(projectId: string) {
  return path.join(projectDir(projectId), 'exports');
}

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/export'>) {
  const { id: projectId } = await ctx.params;
  const dir = exportsDir(projectId);
  try {
    const entries = await readdir(dir);
    const files = await Promise.all(
      entries
        .filter((f) => f.endsWith('.mp4'))
        .map(async (filename) => {
          const stats = await stat(path.join(dir, filename));
          return { filename, sizeBytes: stats.size, modifiedAt: stats.mtime.toISOString() };
        }),
    );
    files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return Response.json({ exports: files });
  } catch {
    return Response.json({ exports: [] });
  }
}

export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/export'>) {
  const { id: projectId } = await ctx.params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { clips: true },
  });
  if (!project) return Response.json({ error: 'project not found' }, { status: 404 });
  if (!isValidEdl(project.edl)) return Response.json({ error: 'project sin EDL' }, { status: 409 });

  try {
    const props = await buildVlogProps({
      projectId,
      edl: project.edl,
      clips: project.clips,
      baseUrl: getBaseUrl(req),
    });

    const dir = exportsDir(projectId);
    await mkdir(dir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `vlog-${timestamp}.mp4`;
    const outputPath = path.join(dir, filename);

    await renderVlog(props, outputPath);

    return Response.json({ filename, durationFrames: props.totalDurationFrames });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
