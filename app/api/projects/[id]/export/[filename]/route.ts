import { NextRequest } from 'next/server';
import path from 'node:path';
import { projectDir } from '@/lib/paths';
import { serveFile } from '@/lib/http';

export async function GET(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/export/[filename]'>) {
  const { id: projectId, filename } = await ctx.params;

  if (!/^[a-zA-Z0-9._-]+\.mp4$/.test(filename)) {
    return new Response('forbidden', { status: 400 });
  }

  return serveFile(
    path.join(projectDir(projectId), 'exports', filename),
    { contentType: 'video/mp4', contentDisposition: `attachment; filename="${filename}"` },
    req,
  );
}
