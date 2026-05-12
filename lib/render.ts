import path from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { Edl } from './edl';
import { MusicBlock } from './music';
import type { Clip } from './generated/prisma/client';
import { voDir } from './paths';
import { MusicTrackProp, SegmentProp, VLOG_COMPOSITION_ID, VlogInputProps } from './remotion/types';

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

let cachedServeUrl: string | null = null;

function entryPoint(): string {
  return path.resolve(process.cwd(), 'lib', 'remotion', 'index.ts');
}

async function getServeUrl(): Promise<string> {
  if (cachedServeUrl) return cachedServeUrl;
  cachedServeUrl = await bundle({ entryPoint: entryPoint() });
  return cachedServeUrl;
}

export type BuildPropsInput = {
  projectId: string;
  edl: Edl;
  musicBlocks: MusicBlock[];
  clips: Clip[];
  baseUrl: string;
};

export async function buildVlogProps(input: BuildPropsInput): Promise<VlogInputProps> {
  const { projectId, edl, musicBlocks, clips, baseUrl } = input;
  const clipsById = new Map<string, Clip>(clips.map((c) => [c.id, c]));

  const segments: SegmentProp[] = [];
  const segmentStartFrames: number[] = [];
  let frameCursor = 0;

  for (let i = 0; i < edl.segments.length; i++) {
    const seg = edl.segments[i];
    segmentStartFrames.push(frameCursor);

    if (seg.kind === 'clip') {
      const clip = clipsById.get(seg.clipId);
      if (!clip) throw new Error(`Clip ${seg.clipId} no encontrado`);
      const durationFrames = Math.max(1, Math.round(((seg.outMs - seg.inMs) / 1000) * FPS));
      segments.push({
        kind: 'clip',
        videoUrl: `${baseUrl}/api/projects/${projectId}/clips/${clip.id}/file`,
        trimStartSec: seg.inMs / 1000,
        trimEndSec: seg.outMs / 1000,
        durationFrames,
        clipWidth: clip.width,
        clipHeight: clip.height,
      });
      frameCursor += durationFrames;
    } else {
      // Voiceover: use recorded VO duration if available, else estimate
      let voDurationMs = seg.durationEstimateMs;
      let voAudioUrl: string | null = null;
      try {
        const meta = JSON.parse(await readFile(path.join(voDir(projectId), `seg-${i}.meta.json`), 'utf8'));
        if (typeof meta.durationMs === 'number' && meta.durationMs > 0) {
          voDurationMs = meta.durationMs;
          voAudioUrl = `${baseUrl}/api/projects/${projectId}/vo/${i}?audio=1`;
        }
      } catch {
        // no recording
      }
      const durationFrames = Math.max(1, Math.round((voDurationMs / 1000) * FPS));

      const brollClipId = seg.brollClipIds[0];
      const brollClip = brollClipId ? clipsById.get(brollClipId) : null;
      segments.push({
        kind: 'voiceover',
        brollVideoUrl: brollClip ? `${baseUrl}/api/projects/${projectId}/clips/${brollClip.id}/file` : null,
        brollClipWidth: brollClip?.width ?? WIDTH,
        brollClipHeight: brollClip?.height ?? HEIGHT,
        voAudioUrl,
        durationFrames,
      });
      frameCursor += durationFrames;
    }
  }

  const totalDurationFrames = frameCursor;

  const musicTracks: MusicTrackProp[] = [];
  for (const block of musicBlocks) {
    if (!block.audioExt) continue;
    const startFrame = segmentStartFrames[block.startSegmentIdx] ?? 0;
    const endIdx = Math.min(block.endSegmentIdx, segments.length - 1);
    const endFrame = (segmentStartFrames[endIdx] ?? 0) + (segments[endIdx]?.durationFrames ?? 0);
    musicTracks.push({
      audioUrl: `${baseUrl}/api/projects/${projectId}/music/${block.id}/audio`,
      startFrame,
      durationFrames: Math.max(1, endFrame - startFrame),
    });
  }

  return {
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    segments,
    musicTracks,
    totalDurationFrames: Math.max(1, totalDurationFrames),
  };
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
