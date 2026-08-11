import { NextRequest } from 'next/server';
import { Prisma } from '@/lib/generated/prisma/client';
import { Edl } from '@/lib/edl';
import { loadProjectPlan } from '@/lib/project';
import { downloadTrack, JamendoTrack } from '@/lib/music-search';
import { updateProjectIfFresh, parseExpectedPlanVersion, staleWriteResponse } from '@/lib/concurrency';

type ApplyBody = {
  track: JamendoTrack;
  baseVolume?: number;
  expectedPlanVersion: number;
};

export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/plan/music/[sectionId]'>) {
  const { id: projectId, sectionId } = await ctx.params;
  const body = (await req.json()) as Partial<ApplyBody>;
  if (!body?.track?.trackId) return Response.json({ error: 'falta track' }, { status: 400 });
  const expectedPlanVersion = parseExpectedPlanVersion(body);
  if (expectedPlanVersion === null) return Response.json({ error: 'falta expectedPlanVersion' }, { status: 400 });

  const plan = await loadProjectPlan(projectId);
  if (!plan?.edl) return Response.json({ error: 'sin EDL editable' }, { status: 409 });

  const section = plan.edl.music.sections.find((s) => s.id === sectionId);
  if (!section) return Response.json({ error: 'section no existe' }, { status: 404 });

  await downloadTrack(body.track);

  section.trackId = body.track.trackId;
  section.trackTitle = body.track.title;
  section.trackArtist = body.track.artist;
  section.trackUrl = body.track.shareUrl;
  section.trackLicenseUrl = body.track.licenseUrl;
  if (typeof body.baseVolume === 'number') section.baseVolume = body.baseVolume;

  const updated: Edl = plan.edl;
  let planVersion: number;
  try {
    planVersion = await updateProjectIfFresh(projectId, expectedPlanVersion, {
      edl: updated as unknown as Prisma.InputJsonValue,
    });
  } catch (err) {
    const conflict = staleWriteResponse(err);
    if (conflict) return conflict;
    throw err;
  }
  return Response.json({ edl: updated, planVersion });
}
