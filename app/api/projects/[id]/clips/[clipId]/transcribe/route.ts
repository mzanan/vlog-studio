import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { retryTranscribe } from '@/lib/transcribeQueue';
import { whisperUnavailableResponse } from '@/lib/whisper-bin';

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<'/api/projects/[id]/clips/[clipId]/transcribe'>,
) {
  const { id: projectId, clipId } = await ctx.params;

  const clip = await prisma.clip.findFirst({
    where: { id: clipId, projectId },
    select: { id: true },
  });
  if (!clip) return Response.json({ error: 'clip not found' }, { status: 404 });

  const unavailable = whisperUnavailableResponse();
  if (unavailable) return unavailable;

  const queued = await retryTranscribe([clip.id]);
  return Response.json({ queued });
}
