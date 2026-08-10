import { NextRequest } from 'next/server';
import { searchJamendoMusic } from '@/lib/music-search';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = url.searchParams.get('query')?.trim();
  const durationMs = Number(url.searchParams.get('durationMs') ?? '0');
  const limit = Math.max(1, Math.min(30, Number(url.searchParams.get('limit') ?? '5')));
  if (!query) return Response.json({ error: 'falta query' }, { status: 400 });
  if (!durationMs || durationMs <= 0) return Response.json({ error: 'falta durationMs' }, { status: 400 });

  try {
    const [inst, any] = await Promise.all([
      searchJamendoMusic({ query, durationMs, instrumental: true, limit }),
      searchJamendoMusic({ query, durationMs, instrumental: false, limit }),
    ]);
    const seen = new Set<string>();
    const tracks = [...inst, ...any]
      .filter((t) => (seen.has(t.trackId) ? false : (seen.add(t.trackId), true)))
      .slice(0, limit);
    return Response.json({ tracks });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
