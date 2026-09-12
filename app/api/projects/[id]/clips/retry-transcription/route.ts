import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { retryTranscribe } from '@/lib/transcribeQueue';
import { whisperUnavailableResponse } from '@/lib/whisper-bin';

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<'/api/projects/[id]/clips/retry-transcription'>,
) {
  const { id: projectId } = await ctx.params;

  const failed = await prisma.clip.findMany({
    where: { projectId, transcribeError: { not: null } },
    select: { id: true },
  });
  if (failed.length === 0) return Response.json({ queued: 0 });

  const unavailable = whisperUnavailableResponse();
  if (unavailable) return unavailable;

  const queued = await retryTranscribe(failed.map((clip) => clip.id));
  return Response.json({ queued });
}
