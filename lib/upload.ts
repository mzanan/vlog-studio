import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

export async function streamRequestBodyToFile(
  body: ReadableStream<Uint8Array> | null,
  destPath: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!body) throw new Error('empty request body');
  const nodeStream = Readable.fromWeb(body as unknown as NodeWebReadableStream<Uint8Array>);
  await pipeline(nodeStream, createWriteStream(destPath), { signal });
}
