import { AbsoluteFill, Audio, OffthreadVideo, Sequence, useCurrentFrame } from 'remotion';
import { CaptionProp, MusicSectionProp, SegmentProp, VlogInputProps, VoiceoverProp } from './types';

const CLIP_AUDIO_VOLUME = 1.0;
const BROLL_AUDIO_VOLUME = 0;
const VO_VOLUME = 1.0;
const MUSIC_DUCK_FACTOR = 0.5;
const CAPTION_FONT_RATIO = 0.052;
const CAPTION_BOTTOM_RATIO_VERTICAL = 0.18;
const CAPTION_BOTTOM_RATIO_LANDSCAPE = 0.08;

function buildSegmentBlocks(
  segments: SegmentProp[],
  width: number,
  height: number,
  fps: number,
  fit: VlogInputProps['fit'],
) {
  const blocks: React.ReactElement[] = [];
  let frameCursor = 0;
  for (const [idx, seg] of segments.entries()) {
    blocks.push(
      <Sequence key={`seg-${idx}`} from={frameCursor} durationInFrames={seg.durationFrames}>
        <SegmentVideo segment={seg} canvasWidth={width} canvasHeight={height} fps={fps} fit={fit} />
      </Sequence>,
    );
    frameCursor += seg.durationFrames;
  }
  return blocks;
}

export function Vlog({
  width,
  height,
  fps,
  fit,
  segments,
  voiceover,
  musicSections,
  captions,
}: VlogInputProps) {
  const segmentBlocks = buildSegmentBlocks(segments, width, height, fps, fit);

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      {segmentBlocks}
      {voiceover.audioUrl && <Audio src={voiceover.audioUrl} volume={VO_VOLUME} />}
      {musicSections.map((sec, idx) => (
        <MusicSectionLayer key={`music-${idx}`} section={sec} voiceover={voiceover} segments={segments} />
      ))}
      <CaptionsLayer captions={captions} width={width} height={height} />
    </AbsoluteFill>
  );
}

function CaptionsLayer({
  captions,
  width,
  height,
}: {
  captions: CaptionProp[];
  width: number;
  height: number;
}) {
  const frame = useCurrentFrame();
  if (captions.length === 0) return null;
  const active = captions.find((c) => frame >= c.startFrame && frame < c.endFrame);
  if (!active) return null;

  const fontSize = Math.round(Math.min(width, height) * CAPTION_FONT_RATIO);
  const bottomRatio = height > width ? CAPTION_BOTTOM_RATIO_VERTICAL : CAPTION_BOTTOM_RATIO_LANDSCAPE;

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: Math.round(height * bottomRatio),
        paddingLeft: Math.round(width * 0.08),
        paddingRight: Math.round(width * 0.08),
      }}
    >
      <span
        style={{
          color: 'white',
          fontFamily: 'Inter, Helvetica, Arial, sans-serif',
          fontSize,
          fontWeight: 800,
          lineHeight: 1.15,
          textAlign: 'center',
          textTransform: 'uppercase',
          WebkitTextStroke: `${Math.max(2, Math.round(fontSize * 0.06))}px black`,
          paintOrder: 'stroke fill',
          textShadow: '0 4px 18px rgba(0,0,0,0.55)',
        }}
      >
        {active.text}
      </span>
    </AbsoluteFill>
  );
}

function SegmentVideo({
  segment,
  canvasWidth,
  canvasHeight,
  fps,
  fit,
}: {
  segment: SegmentProp;
  canvasWidth: number;
  canvasHeight: number;
  fps: number;
  fit: VlogInputProps['fit'];
}) {
  const scaleX = canvasWidth / segment.clipWidth;
  const scaleY = canvasHeight / segment.clipHeight;
  const scale = fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const renderedWidth = segment.clipWidth * scale;
  const renderedHeight = segment.clipHeight * scale;
  const left = (canvasWidth - renderedWidth) / 2;
  const top = (canvasHeight - renderedHeight) / 2;

  const baseVolume = segment.kind === 'clip' ? CLIP_AUDIO_VOLUME : BROLL_AUDIO_VOLUME;
  const audioVolume = baseVolume * (segment.audioVolumeMul ?? 1);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left, top, width: renderedWidth, height: renderedHeight }}>
        <OffthreadVideo
          src={segment.videoUrl}
          startFrom={Math.round(segment.trimStartSec * fps)}
          endAt={Math.round(segment.trimEndSec * fps)}
          volume={audioVolume}
          playbackRate={segment.playbackRate}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </AbsoluteFill>
  );
}

// Sección musical con ducking automático: bajamos el volumen si hay un VO cue activo
// o si el segment del video activo es kind=clip (el usuario está hablando).
function MusicSectionLayer({
  section,
  voiceover,
  segments,
}: {
  section: MusicSectionProp;
  voiceover: VoiceoverProp;
  segments: SegmentProp[];
}) {
  if (!section.audioUrl) return null;
  return (
    <Sequence from={section.startFrame} durationInFrames={section.durationFrames}>
      <DuckedMusic
        audioUrl={section.audioUrl}
        baseVolume={section.baseVolume}
        voiceover={voiceover}
        segments={segments}
      />
    </Sequence>
  );
}

function DuckedMusic({
  audioUrl,
  baseVolume,
  voiceover,
  segments,
}: {
  audioUrl: string;
  baseVolume: number;
  voiceover: VoiceoverProp;
  segments: SegmentProp[];
}) {
  const frame = useCurrentFrame();
  const inVoCue = voiceover.cues.some((c) => frame >= c.startFrame && frame < c.endFrame);

  let cursor = 0;
  let activeKind: SegmentProp['kind'] = 'broll';
  for (const seg of segments) {
    if (frame >= cursor && frame < cursor + seg.durationFrames) {
      activeKind = seg.kind;
      break;
    }
    cursor += seg.durationFrames;
  }
  const isSpeech = activeKind === 'clip';
  const volume = inVoCue || isSpeech ? baseVolume * MUSIC_DUCK_FACTOR : baseVolume;
  return <Audio src={audioUrl} volume={volume} />;
}
