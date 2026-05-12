import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
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

export async function renderVlog(props: VlogInputProps, outputPath: string): Promise<RenderResult> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const serveUrl = await getServeUrl();

  const composition = await selectComposition({
    serveUrl,
    id: VLOG_COMPOSITION_ID,
    inputProps: props,
  });

  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    codec: 'h264',
    outputLocation: outputPath,
    concurrency: null,
  });

  return { outputPath, durationFrames: composition.durationInFrames };
}
