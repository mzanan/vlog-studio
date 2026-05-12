export type SegmentProp =
  | {
      kind: 'clip';
      videoUrl: string;
      trimStartSec: number;
      trimEndSec: number;
      durationFrames: number;
      clipWidth: number;
      clipHeight: number;
    }
  | {
      kind: 'voiceover';
      brollVideoUrl: string | null;
      brollClipWidth: number;
      brollClipHeight: number;
      voAudioUrl: string | null;
      durationFrames: number;
    };

export type MusicTrackProp = {
  audioUrl: string;
  startFrame: number;
  durationFrames: number;
};

export type VlogInputProps = {
  width: number;
  height: number;
  fps: number;
  segments: SegmentProp[];
  musicTracks: MusicTrackProp[];
  totalDurationFrames: number;
};

export const VLOG_COMPOSITION_ID = 'Vlog';
