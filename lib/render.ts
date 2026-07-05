import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';
import { VLOG_COMPOSITION_ID, VlogInputProps } from './remotion/types';

export { buildVlogProps, FPS, WIDTH, HEIGHT } from './render-props';
export type { BuildPropsInput } from './render-props';

let cachedServeUrl: string | null = null;

function entryPoint(): string {
  return path.resolve(process.cwd(), 'lib', 'remotion', 'index.ts');
}

async function getServeUrl(): Promise<string> {
  if (cachedServeUrl) return cachedServeUrl;
  cachedServeUrl = await bundle({ entryPoint: entryPoint() });
  return cachedServeUrl;
}

export type RenderResult = { outputPath: string; durationFrames: number };

const RENDER_TIMEOUT_MS = 3_600_000;

export async function renderVlog(
  props: VlogInputProps,
  outputPath: string,
  signal?: AbortSignal,
): Promise<RenderResult> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const serveUrl = await getServeUrl();

  const composition = await selectComposition({
    serveUrl,
    id: VLOG_COMPOSITION_ID,
    inputProps: props,
  });

  const timeoutSignal = AbortSignal.timeout(RENDER_TIMEOUT_MS);
  const abortSignal = signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
  const { cancelSignal, cancel } = makeCancelSignal();
  const onAbort = () => cancel();
  if (abortSignal.aborted) throw new Error('render aborted by request');
  abortSignal.addEventListener('abort', onAbort, { once: true });

  try {
    await renderMedia({
      serveUrl,
      composition,
      inputProps: props,
      codec: 'h264',
      outputLocation: outputPath,
      concurrency: null,
      cancelSignal,
    });
  } catch (err) {
    if (abortSignal.aborted) {
      throw new Error(timeoutSignal.aborted
        ? `render timed out after ${RENDER_TIMEOUT_MS}ms`
        : 'render aborted by request');
    }
    throw err;
  } finally {
    abortSignal.removeEventListener('abort', onAbort);
  }

  return { outputPath, durationFrames: composition.durationInFrames };
}
