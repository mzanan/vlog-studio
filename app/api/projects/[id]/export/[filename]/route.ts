import { NextRequest } from 'next/server';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { projectDir } from '@/lib/paths';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/export/[filename]'>) {
  const { id: projectId, filename } = await ctx.params;

  if (!/^[a-zA-Z0-9._-]+\.mp4$/.test(filename)) {
    return new Response('forbidden', { status: 400 });
  }

  const filePath = path.join(projectDir(projectId), 'exports', filename);

  try {
    const buf = await readFile(filePath);
    return new Response(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(buf.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
