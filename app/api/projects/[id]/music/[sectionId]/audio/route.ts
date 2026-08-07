import { NextRequest } from 'next/server';
import { loadProjectPlan } from '@/lib/project';
import { musicTrackPath } from '@/lib/paths';
import { serveFile } from '@/lib/http';

export async function GET(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/music/[sectionId]/audio'>) {
  const { id: projectId, sectionId } = await ctx.params;
  const plan = await loadProjectPlan(projectId);
  if (!plan?.edl) return new Response('not found', { status: 404 });

  const found = plan.edl.music.sections.find((s) => s.id === sectionId);
  if (!found?.trackId) return new Response('not found', { status: 404 });

  return serveFile(
    musicTrackPath(found.trackId),
    { contentType: 'audio/mpeg', cacheControl: 'private, max-age=3600' },
    req,
  );
}
