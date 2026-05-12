import { Composition } from 'remotion';
import { Vlog } from './Vlog';
import { VLOG_COMPOSITION_ID, VlogInputProps } from './types';

const DEFAULT_PROPS: VlogInputProps = {
  width: 1920,
  height: 1080,
  fps: 30,
  segments: [],
  musicTracks: [],
  totalDurationFrames: 30,
};

export function RemotionRoot() {
  return (
    <Composition
      id={VLOG_COMPOSITION_ID}
      component={Vlog}
      durationInFrames={DEFAULT_PROPS.totalDurationFrames}
      fps={DEFAULT_PROPS.fps}
      width={DEFAULT_PROPS.width}
      height={DEFAULT_PROPS.height}
      defaultProps={DEFAULT_PROPS}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, props.totalDurationFrames),
        fps: props.fps,
        width: props.width,
        height: props.height,
      })}
    />
  );
}
