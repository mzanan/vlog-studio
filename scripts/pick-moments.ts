import { prisma } from '@/lib/db';
import { loadMomentScores, writeMomentScores, ClipMomentScore } from '@/lib/momentScore';
import { pickBestWindow, currentVisionPickProvider, currentVisionPickModel } from '@/lib/visionPick';

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error('usage: tsx scripts/pick-moments.ts <projectId>');
    process.exit(1);
  }

  console.log(`provider: ${currentVisionPickProvider()}, model: ${currentVisionPickModel()}`);

  const scores = await loadMomentScores(projectId);
  if (scores.length === 0) {
    console.error(`no moment scores found for project ${projectId}, run score-moments first`);
    process.exit(1);
  }

  const clips = await prisma.clip.findMany({
    where: { id: { in: scores.map((s) => s.clipId) } },
    select: { id: true, path: true },
  });
  const pathById = new Map(clips.map((c) => [c.id, c.path]));

  const updated: ClipMomentScore[] = [];
  for (const [i, score] of scores.entries()) {
    const clipPath = pathById.get(score.clipId);
    if (!clipPath) {
      console.error(`[${i + 1}/${scores.length}] ${score.clipId}: clip not found in db, skipping`);
      updated.push(score);
      continue;
    }
    if (score.windows.length === 0) {
      console.error(`[${i + 1}/${scores.length}] ${score.clipId}: sin ventanas candidatas, skipping`);
      updated.push(score);
      continue;
    }
    try {
      const pick = await pickBestWindow(clipPath, score.windows);
      updated.push({ ...score, pick });
      console.log(`[${i + 1}/${scores.length}] ${score.clipId}: picked window ${pick.windowIndex}, reason: ${pick.reason}`);
    } catch (err) {
      console.error(`[${i + 1}/${scores.length}] ${score.clipId}: ERROR ${(err as Error).message}, kept without pick`);
      updated.push(score);
    }
  }

  await writeMomentScores(projectId, updated);
  console.log(`done: ${updated.length} clips, output data/moment-scores/${projectId}.jsonl`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
