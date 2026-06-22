import { NextRequest } from 'next/server';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

export type ServeFileOptions = {
  contentType: string;
  cacheControl?: string;
  contentDisposition?: string;
};

// Servidor de archivos con soporte HTTP Range. Streamea desde disco con
// createReadStream para evitar cargar archivos grandes en memoria por request
// (un seek de Remotion sobre un video de 100MB dispara N Range requests).
export async function serveFile(
  filePath: string,
  opts: ServeFileOptions,
  req?: NextRequest,
): Promise<Response> {
  let size: number;
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return new Response('not found', { status: 404 });
    size = s.size;
  } catch {
    return new Response('not found', { status: 404 });
  }

  const baseHeaders: Record<string, string> = {
    'Content-Type': opts.contentType,
    'Accept-Ranges': 'bytes',
  };
  if (opts.cacheControl) baseHeaders['Cache-Control'] = opts.cacheControl;
  if (opts.contentDisposition) baseHeaders['Content-Disposition'] = opts.contentDisposition;

  const signal = req?.signal;
  const range = req?.headers.get('range');
  if (range) {
    const parsed = parseRange(range, size);
    if (parsed === 'invalid') {
      return new Response('range not satisfiable', {
        status: 416,
        headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` },
      });
    }
    const { start, end } = parsed;
    const length = end - start + 1;
    const stream = streamFromFile(filePath, start, end, signal);
    return new Response(stream, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(length),
      },
    });
  }

  const stream = streamFromFile(filePath, 0, size - 1, signal);
  return new Response(stream, {
    headers: { ...baseHeaders, 'Content-Length': String(size) },
  });
}

// Parsea Range: maneja `bytes=N-`, `bytes=N-M`, y suffix `bytes=-N` (los últimos N bytes).
function parseRange(range: string, size: number): { start: number; end: number } | 'invalid' {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!m) return 'invalid';
  const hasStart = m[1] !== '';
  const hasEnd = m[2] !== '';
  let start: number;
  let end: number;
  if (!hasStart && hasEnd) {
    // suffix: bytes=-500 → últimos 500 bytes
    const suffixLength = parseInt(m[2], 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return 'invalid';
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else if (hasStart && !hasEnd) {
    start = parseInt(m[1], 10);
    end = size - 1;
  } else if (hasStart && hasEnd) {
    start = parseInt(m[1], 10);
    end = parseInt(m[2], 10);
  } else {
    return 'invalid';
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid';
  if (start < 0 || end >= size || start > end) return 'invalid';
  return { start, end };
}

function streamFromFile(
  filePath: string,
  start: number,
  end: number,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const nodeStream = createReadStream(filePath, { start, end });
  // Si el browser cancela la Range request (típico al seekear), destruimos el
  // read stream para evitar `Invalid state: Controller is already closed`.
  if (signal) {
    if (signal.aborted) nodeStream.destroy();
    else signal.addEventListener('abort', () => nodeStream.destroy(), { once: true });
  }
  // Swallow errores de stream destruido — son comportamiento esperado en aborts.
  nodeStream.on('error', () => {});
  return Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

export function getBaseUrl(req: NextRequest): string {
  const protocol = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('host') ?? 'localhost:3030';
  return `${protocol}://${host}`;
}
