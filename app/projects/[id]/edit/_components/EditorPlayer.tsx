'use client';

import { useCallback, useEffect, useState } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { Loader, Paper } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Vlog } from '@/lib/remotion/Vlog';
import { VlogInputProps } from '@/lib/remotion/types';

export function EditorPlayer({
  props,
  loading,
  playerRef,
  onFrameUpdate,
}: {
  props: VlogInputProps | null;
  loading: boolean;
  playerRef: React.RefObject<PlayerRef | null>;
  onFrameUpdate?: (frame: number) => void;
}) {
  const [playerMounted, setPlayerMounted] = useState(false);

  const setPlayerRef = useCallback(
    (instance: PlayerRef | null) => {
      playerRef.current = instance;
      setPlayerMounted(instance !== null);
    },
    [playerRef],
  );

  useEffect(() => {
    if (!playerMounted || !playerRef.current) return;
    const ref = playerRef.current;
    const frameHandler = (e: { detail: { frame: number } }) =>
      onFrameUpdate?.(e.detail.frame);
    const errorHandler = (e: { detail: { error: Error } }) => {
      console.error('[Player error]', e.detail.error);
      notifications.show({
        color: 'red',
        title: 'Error playing video',
        message: e.detail.error.message.slice(0, 200),
        autoClose: 10000,
      });
    };
    ref.addEventListener('frameupdate', frameHandler);
    ref.addEventListener('error', errorHandler);
    return () => {
      ref.removeEventListener('frameupdate', frameHandler);
      ref.removeEventListener('error', errorHandler);
    };
  }, [onFrameUpdate, playerRef, playerMounted]);

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
        ref={setPlayerRef}
        component={Vlog}
        inputProps={props}
        durationInFrames={props.totalDurationFrames}
        compositionWidth={props.width}
        compositionHeight={props.height}
        fps={props.fps}
        controls
        errorFallback={() => 'Error reproduciendo este clip — ver toast'}
        style={{ width: '100%', aspectRatio: `${props.width}/${props.height}` }}
        acknowledgeRemotionLicense
      />
    </Paper>
  );
}
