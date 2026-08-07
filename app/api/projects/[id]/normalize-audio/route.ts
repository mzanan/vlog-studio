import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { analyzeLoudness } from '@/lib/ffmpeg';

const CONCURRENCY = 2;

export async function POST(
  _req: NextRequest,
  ctx: RouteContext<'/api/projects/[id]/normalize-audio'>,
) {
  const { id: projectId } = await ctx.params;

  const clips = await prisma.clip.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  });
  if (clips.length === 0) return Response.json({ error: 'sin clips' }, { status: 404 });

  const results: Array<{ clipId: string; filename: string; inputI?: number; gainDb?: number; error?: string }> = [];

  // Loudnorm de un clip de 30s tarda ~real-time → procesamos en paralelo limitado.
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, clips.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= clips.length) break;
      const c = clips[i];
      try {
        const { inputI, gainDb } = await analyzeLoudness(c.path);
        await prisma.clip.update({ where: { id: c.id }, data: { audioGainDb: gainDb } });
        results.push({ clipId: c.id, filename: c.filename, inputI, gainDb });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ clipId: c.id, filename: c.filename, error: msg });
      }
    }
  });
  await Promise.all(workers);

  // Devolvemos en el mismo orden que los clips de input.
  const byId = new Map(results.map((r) => [r.clipId, r]));
  const ordered = clips.map((c) => byId.get(c.id)).filter((r): r is NonNullable<typeof r> => !!r);

  return Response.json({
    normalized: ordered.filter((r) => !r.error).length,
    failed: ordered.filter((r) => r.error).length,
    results: ordered,
  });
}
