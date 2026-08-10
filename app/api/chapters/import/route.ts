import { NextRequest } from 'next/server';
import { loadImportProgress, startChapterImport } from '@/lib/chapterImport';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const maxChapters = typeof body?.maxChapters === 'number' ? body.maxChapters : undefined;

  try {
    const progress = await startChapterImport(maxChapters);
    return Response.json(progress, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === 'import already starting' ? 409 : 404;
    return Response.json({ error: message }, { status });
  }
}

export async function GET() {
  const progress = await loadImportProgress();
  if (!progress) return Response.json({ error: 'no import in progress' }, { status: 404 });
  return Response.json(progress);
}
