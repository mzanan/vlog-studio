import { prisma } from './db';
import { VOICE_THRESHOLD_WPS, computeWordsPerSec, transcribe } from './transcribe';
import { runHeavy } from './heavyQueue';

const inFlight = new Set<string>();

export function enqueueTranscribe(clipId: string) {
  if (inFlight.has(clipId)) return;
  inFlight.add(clipId);
  void runHeavy(() => runTranscribe(clipId)).finally(() => inFlight.delete(clipId));
}

async function runTranscribe(clipId: string) {
  const clip = await prisma.clip.findUnique({ where: { id: clipId } });
  if (!clip) return;
  if (clip.transcribedAt) return;

  try {
    const result = await transcribe(clip.path);
    const wps = computeWordsPerSec(result, clip.durationMs);

    await prisma.$transaction(async (tx) => {
      await tx.segment.deleteMany({ where: { clipId } });
      let wordIndex = 0;
      for (const seg of result.segments) {
        const words = seg.words ?? [{ word: seg.text, start: seg.start, end: seg.end }];
        for (const w of words) {
          await tx.segment.create({
            data: {
              clipId,
              startMs: Math.round((w.start ?? seg.start) * 1000),
              endMs: Math.round((w.end ?? seg.end) * 1000),
              text: w.word.trim(),
              wordIndex: wordIndex++,
            },
          });
        }
      }
      await tx.clip.update({
        where: { id: clipId },
        data: {
          wordsPerSec: wps,
          hasVoice: wps >= VOICE_THRESHOLD_WPS,
          transcribedAt: new Date(),
          transcribeError: null,
        },
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.clip.update({
      where: { id: clipId },
      data: { transcribeError: message.slice(0, 500) },
    });
  }
}
