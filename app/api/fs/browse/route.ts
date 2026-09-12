import { NextRequest } from 'next/server';
import { defaultStartDir, listDirectory, resolveInsideRoot } from '@/lib/fs-browse';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const requested = new URL(req.url).searchParams.get('path');
  try {
    const dir = requested ? resolveInsideRoot(requested) : await defaultStartDir();
    const listing = await listDirectory(dir);
    return Response.json(listing);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 400 });
  }
}
