import { NextRequest } from 'next/server';
import { loadProjectEdls } from '@/lib/project';
import { musicTrackPath } from '@/lib/paths';
import { serveFile } from '@/lib/http';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/projects/[id]/music/[sectionId]/audio'>) {
  const { id: projectId, sectionId } = await ctx.params;
  const edls = await loadProjectEdls(projectId);
  if (!edls) return new Response('not found', { status: 404 });

  for (const e of [edls.edl, edls.suggestion]) {
    const found = e?.music.sections.find((s) => s.id === sectionId);
    if (found?.trackId) {
      return serveFile(musicTrackPath(found.trackId), {
        contentType: 'audio/mpeg',
        cacheControl: 'private, max-age=3600',
      });
    }
  }
  return new Response('not found', { status: 404 });
}
