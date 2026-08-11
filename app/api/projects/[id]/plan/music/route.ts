import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@/lib/generated/prisma/client';
import { Edl, MusicSection, defaultBaseVolumeFor, Energy } from '@/lib/edl';
import { loadProjectPlan } from '@/lib/project';
import { downloadTrack, JamendoTrack } from '@/lib/music-search';
import { updateProjectIfFresh, StaleWriteError } from '@/lib/concurrency';

type CreateBody = {
  startMs: number;
  endMs: number;
  query: string;
  mood: string;
  energy: Energy;
  baseVolume?: number;
  reason?: string;
  track: JamendoTrack;
  expectedPlanVersion: number;
};

const VALID_ENERGIES: Energy[] = ['low', 'mid', 'high'];

export async function POST(req: NextRequest, ctx: RouteContext<'/api/projects/[id]/plan/music'>) {
  const { id: projectId } = await ctx.params;
  const body = (await req.json()) as Partial<CreateBody>;

  if (typeof body.startMs !== 'number' || typeof body.endMs !== 'number' || body.endMs <= body.startMs) {
    return Response.json({ error: 'rango inválido' }, { status: 400 });
  }
  if (!body.query || !body.mood) return Response.json({ error: 'falta query o mood' }, { status: 400 });
  if (!body.energy || !VALID_ENERGIES.includes(body.energy)) {
    return Response.json({ error: 'energy inválida' }, { status: 400 });
  }
  if (!body.track?.trackId) return Response.json({ error: 'falta track' }, { status: 400 });
  if (!Number.isInteger(body.expectedPlanVersion) || (body.expectedPlanVersion as number) < 0) {
    return Response.json({ error: 'falta expectedPlanVersion' }, { status: 400 });
  }

  const plan = await loadProjectPlan(projectId);
  if (!plan?.edl) return Response.json({ error: 'sin EDL editable' }, { status: 409 });

  await downloadTrack(body.track);

  const section: MusicSection = {
    id: randomUUID(),
    startMs: Math.round(body.startMs),
    endMs: Math.round(body.endMs),
    query: body.query,
    mood: body.mood,
    energy: body.energy,
    baseVolume: typeof body.baseVolume === 'number' ? body.baseVolume : defaultBaseVolumeFor(body.energy),
    reason: body.reason ?? 'insertado manualmente',
    trackId: body.track.trackId,
    trackTitle: body.track.title,
    trackArtist: body.track.artist,
    trackUrl: body.track.shareUrl,
    trackLicenseUrl: body.track.licenseUrl,
  };

  const updated: Edl = {
    ...plan.edl,
    music: {
      sections: [...plan.edl.music.sections, section].sort((a, b) => a.startMs - b.startMs),
    },
  };

  let planVersion: number;
  try {
    planVersion = await updateProjectIfFresh(projectId, body.expectedPlanVersion as number, {
      edl: updated as unknown as Prisma.InputJsonValue,
    });
  } catch (err) {
    if (err instanceof StaleWriteError) return Response.json({ error: err.message, conflict: true }, { status: 409 });
    throw err;
  }

  return Response.json({ edl: updated, section, planVersion });
}
