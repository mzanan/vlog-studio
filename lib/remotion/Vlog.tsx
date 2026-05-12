import { AbsoluteFill, Audio, OffthreadVideo, Sequence } from 'remotion';
import { MusicTrackProp, SegmentProp, VlogInputProps } from './types';

const MUSIC_VOLUME = 0.15;
const BROLL_CLIP_AUDIO_VOLUME = 0;
const CLIP_AUDIO_VOLUME = 1.0;
const VO_VOLUME = 1.0;

export function Vlog({ width, height, segments, musicTracks }: VlogInputProps) {
  let frameCursor = 0;
  const renderedSegments = segments.map((seg, idx) => {
    const from = frameCursor;
    frameCursor += seg.durationFrames;
    return (
      <Sequence key={idx} from={from} durationInFrames={seg.durationFrames}>
        <SegmentRenderer segment={seg} canvasWidth={width} canvasHeight={height} />
      </Sequence>
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {renderedSegments}
      {musicTracks.map((track, idx) => (
        <MusicLayer key={`music-${idx}`} track={track} />
      ))}
    </AbsoluteFill>
  );
}

function MusicLayer({ track }: { track: MusicTrackProp }) {
  return (
    <Sequence from={track.startFrame} durationInFrames={track.durationFrames}>
      <Audio src={track.audioUrl} volume={MUSIC_VOLUME} />
    </Sequence>
  );
}

function SegmentRenderer({
  segment,
  canvasWidth,
  canvasHeight,
}: {
  segment: SegmentProp;
  canvasWidth: number;
  canvasHeight: number;
}) {
  if (segment.kind === 'clip') {
    return (
      <ClipFrame
        videoUrl={segment.videoUrl}
        trimStartSec={segment.trimStartSec}
        trimEndSec={segment.trimEndSec}
        clipWidth={segment.clipWidth}
        clipHeight={segment.clipHeight}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        volume={CLIP_AUDIO_VOLUME}
      />
    );
  }

  return (
    <>
      {segment.brollVideoUrl && (
        <ClipFrame
          videoUrl={segment.brollVideoUrl}
          trimStartSec={0}
          trimEndSec={Math.max(1, Math.ceil(segment.durationFrames / 30))}
          clipWidth={segment.brollClipWidth}
          clipHeight={segment.brollClipHeight}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          volume={BROLL_CLIP_AUDIO_VOLUME}
        />
      )}
      {segment.voAudioUrl && <Audio src={segment.voAudioUrl} volume={VO_VOLUME} />}
    </>
  );
}

function ClipFrame({
  videoUrl,
  trimStartSec,
  trimEndSec,
  clipWidth,
  clipHeight,
  canvasWidth,
  canvasHeight,
  volume,
}: {
  videoUrl: string;
  trimStartSec: number;
  trimEndSec: number;
  clipWidth: number;
  clipHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  volume: number;
}) {
  const scale = Math.min(canvasWidth / clipWidth, canvasHeight / clipHeight);
  const renderedWidth = clipWidth * scale;
  const renderedHeight = clipHeight * scale;
  const left = (canvasWidth - renderedWidth) / 2;
  const top = (canvasHeight - renderedHeight) / 2;

  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left, top, width: renderedWidth, height: renderedHeight }}>
        <OffthreadVideo
          src={videoUrl}
          startFrom={Math.round(trimStartSec * 30)}
          endAt={Math.round(trimEndSec * 30)}
          volume={volume}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </AbsoluteFill>
  );
}
