'use client';

import { Player } from '@remotion/player';
import { Loader, Paper } from '@mantine/core';
import { Vlog } from '@/lib/remotion/Vlog';
import { VlogInputProps } from '@/lib/remotion/types';

export function EditorPlayer({ props, loading }: { props: VlogInputProps | null; loading: boolean }) {
  if (loading || !props) {
    return (
      <Paper withBorder p="xl" style={{ aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader />
      </Paper>
    );
  }

  return (
    <Paper withBorder style={{ overflow: 'hidden' }}>
      <Player
        component={Vlog}
        inputProps={props}
        durationInFrames={props.totalDurationFrames}
        compositionWidth={props.width}
        compositionHeight={props.height}
        fps={props.fps}
        controls
        style={{ width: '100%', aspectRatio: `${props.width}/${props.height}` }}
        acknowledgeRemotionLicense
      />
    </Paper>
  );
}
