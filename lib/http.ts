import { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';

export type ServeFileOptions = {
  contentType: string;
  cacheControl?: string;
  contentDisposition?: string;
};

export async function serveFile(filePath: string, opts: ServeFileOptions): Promise<Response> {
  try {
    const buf = await readFile(filePath);
    const headers: Record<string, string> = {
      'Content-Type': opts.contentType,
      'Content-Length': String(buf.length),
    };
    if (opts.cacheControl) headers['Cache-Control'] = opts.cacheControl;
    if (opts.contentDisposition) headers['Content-Disposition'] = opts.contentDisposition;
    return new Response(new Uint8Array(buf), { headers });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

export function getBaseUrl(req: NextRequest): string {
  const protocol = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('host') ?? 'localhost:3000';
  return `${protocol}://${host}`;
}
