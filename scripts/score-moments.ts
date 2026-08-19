import { prisma } from '@/lib/db';
import { scoreClip, writeMomentScores, bestOf, ClipMomentScore } from '@/lib/momentScore';
import { momentScoresPath } from '@/lib/paths';
import { envInt } from '@/lib/env';

const TOP_K = envInt('MOMENT_SCORE_TOP_K', 3);

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error('usage: tsx scripts/score-moments.ts <projectId>');
    process.exit(1);
  }

  const clips = await prisma.clip.findMany({
    where: { projectId, hasVoice: false },
    select: { id: true, path: true, durationMs: true, filename: true },
  });
  if (clips.length === 0) {
    console.error(`no b-roll clips (hasVoice=false) found for project ${projectId}`);
    process.exit(1);
  }

  const scores: ClipMomentScore[] = [];
  for (const [i, clip] of clips.entries()) {
    try {
      const result = await scoreClip(clip.id, clip.path, clip.durationMs, TOP_K);
      if (result.windows.length === 0) {
        console.log(`[${i + 1}/${clips.length}] ${clip.filename}: no candidate windows (clip is ${clip.durationMs}ms), skipped`);
        continue;
      }
      scores.push(result);
      const best = bestOf(result.windows);
      console.log(
        `[${i + 1}/${clips.length}] ${clip.filename}: ${result.windows.length} windows, best ${best.startMs}-${best.endMs}ms score=${best.score.toFixed(3)}`,
      );
    } catch (err) {
      console.error(`[${i + 1}/${clips.length}] ${clip.filename}: ERROR ${(err as Error).message}`);
    }
  }

  await writeMomentScores(projectId, scores);
  console.log(`done: ${scores.length}/${clips.length} clips scored, output ${momentScoresPath(projectId)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
