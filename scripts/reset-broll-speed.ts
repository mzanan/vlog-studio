import { prisma } from '@/lib/db';
import { Edl, EdlSegment, isValidEdl } from '@/lib/edl';
import { Prisma } from '@/lib/generated/prisma/client';

async function main() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true, edl: true } });

  let totalBefore = 0;
  let totalAfter = 0;

  for (const project of projects) {
    if (!isValidEdl(project.edl)) {
      console.log(`${project.name}: skipped, no plan generated yet`);
      continue;
    }
    const edl = project.edl as unknown as Edl;
    const before = edl.segments.filter((s) => s.kind === 'broll' && s.speed !== undefined && s.speed !== 1).length;
    totalBefore += before;

    const newSegments: EdlSegment[] = edl.segments.map((s) => (s.kind === 'broll' ? { ...s, speed: 1 } : s));
    const newEdl: Edl = { ...edl, segments: newSegments };
    const after = newSegments.filter((s) => s.kind === 'broll' && s.speed !== undefined && s.speed !== 1).length;
    totalAfter += after;

    await prisma.project.update({
      where: { id: project.id },
      data: { edl: newEdl as unknown as Prisma.InputJsonValue },
    });
    console.log(`${project.name}: ${before} accelerated -> ${after} accelerated`);
  }

  console.log(`TOTAL: ${totalBefore} accelerated -> ${totalAfter} accelerated`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
