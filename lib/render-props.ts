import path from 'node:path';
import { stat } from 'node:fs/promises';
import { Edl, clampBrollSpeed, playbackDurationMs } from './edl';
import { dbToLinear } from './ffmpeg';
import type { Clip } from './generated/prisma/client';
import { projectDir } from './paths';
import { MusicSectionProp, SegmentProp, VlogInputProps, VoiceoverProp } from './remotion/types';

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export type BuildPropsInput = {
  projectId: string;
  edl: Edl;
  clips: Clip[];
  baseUrl: string;
};

function msToFrames(ms: number): number {
  return Math.max(1, Math.round((ms / 1000) * FPS));
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function buildVlogProps(input: BuildPropsInput): Promise<VlogInputProps> {
  const { projectId, edl, clips, baseUrl } = input;
  const clipsById = new Map<string, Clip>(clips.map((c) => [c.id, c]));

  const segments: SegmentProp[] = [];
  let frameCursor = 0;
  for (const seg of edl.segments) {
    const clip = clipsById.get(seg.clipId);
    if (!clip) throw new Error(`Clip ${seg.clipId} no encontrado en el proyecto`);
    const durationFrames = msToFrames(playbackDurationMs(seg));
    const playbackRate = seg.kind === 'broll' ? clampBrollSpeed(seg.speed) : 1;
    segments.push({
      kind: seg.kind,
      videoUrl: `${baseUrl}/api/projects/${projectId}/clips/${clip.id}/file`,
      trimStartSec: seg.inMs / 1000,
      trimEndSec: seg.outMs / 1000,
      durationFrames,
      playbackRate,
      clipWidth: clip.width,
      clipHeight: clip.height,
      audioVolumeMul: typeof clip.audioGainDb === 'number' ? dbToLinear(clip.audioGainDb) : 1,
    });
    frameCursor += durationFrames;
  }
  const totalDurationFrames = Math.max(1, frameCursor);
  const spedUp = segments
    .map((s, i) => ({ i, rate: s.playbackRate, frames: s.durationFrames }))
    .filter((s) => s.rate !== 1);
  console.log(
    `[render-props] ${projectId}: ${segments.length} segments, ${spedUp.length} accelerated`,
    spedUp.map((s) => `#${s.i} ${s.rate}x ${s.frames}f`).join(' ') || '(none)',
  );

  const voPath = path.join(projectDir(projectId), 'vo', 'master.wav');
  const voiceover: VoiceoverProp = {
    audioUrl: (await fileExists(voPath)) ? `${baseUrl}/api/projects/${projectId}/vo` : null,
    cues: edl.voiceover.cues.map((c) => ({
      startFrame: msToFrames(c.startMs),
      endFrame: msToFrames(c.endMs),
    })),
  };

  const musicSections: MusicSectionProp[] = edl.music.sections.map((sec) => ({
    audioUrl: sec.trackUrl
      ? `${baseUrl}/api/projects/${projectId}/music/${sec.id}/audio`
      : null,
    baseVolume: sec.baseVolume,
    startFrame: msToFrames(sec.startMs),
    durationFrames: Math.max(1, msToFrames(sec.endMs) - msToFrames(sec.startMs)),
  }));

  return {
    width: WIDTH,
    height: HEIGHT,
    fps: FPS,
    segments,
    voiceover,
    musicSections,
    totalDurationFrames,
  };
}
