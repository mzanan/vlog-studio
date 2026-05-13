'use client';

import { useMemo } from 'react';
import { Paper, ScrollArea, Stack } from '@mantine/core';
import { Edl, EdlSegment, segmentDurationMs } from '@/lib/edl';
import { ClipMeta } from './Editor';
import { VideoTrack, VideoSegmentItem } from './VideoTrack';
import { MusicTrack } from './MusicTrack';
import { VoTrack } from './VoTrack';
import { useApiMutation } from './useApiMutation';

export const PX_PER_SEC = 50;
export const TRACK_HEIGHT = 64;

export function Timeline({
  projectId,
  edl,
  clips,
  onChanged,
  readOnly = false,
}: {
  projectId: string;
  edl: Edl;
  clips: ClipMeta[];
  onChanged: () => void;
  readOnly?: boolean;
}) {
  const videoItems = useMemo<VideoSegmentItem[]>(
    () =>
      edl.segments.map((seg, idx) => ({
        id: seg.id,
        idx,
        seg,
        widthPx: (segmentDurationMs(seg) / 1000) * PX_PER_SEC,
      })),
    [edl.segments],
  );

  const totalMs = videoItems.reduce((acc, it) => acc + segmentDurationMs(it.seg), 0);
  const totalWidthPx = Math.max(600, (totalMs / 1000) * PX_PER_SEC + 40);
  const clipsLookup = useMemo(() => Object.fromEntries(clips.map((c) => [c.id, c])), [clips]);

  const patchEdl = useApiMutation({
    mutationFn: async (newEdl: Edl) => {
      const res = await fetch(`/api/projects/${projectId}/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edl: newEdl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body.edl as Edl;
    },
    invalidateKeys: [['edl', projectId], ['render-props', projectId]],
    onSuccessExtra: () => onChanged(),
    errorAutoClose: 6000,
  });

  const handleReorder = (newOrder: string[]) => {
    const byId = new Map(videoItems.map((it) => [it.id, it.seg]));
    const newSegments = newOrder
      .map((id) => byId.get(id))
      .filter((s): s is EdlSegment => Boolean(s));
    if (newSegments.length !== edl.segments.length) return;
    patchEdl.mutate({ ...edl, segments: newSegments });
  };

  const handleRestoreClip = (segmentItemId: string) => {
    const idx = videoItems.findIndex((it) => it.id === segmentItemId);
    if (idx < 0) return;
    const seg = videoItems[idx].seg;
    const clip = clipsLookup[seg.clipId];
    if (!clip) return;
    if (seg.inMs === 0 && seg.outMs === clip.durationMs) return;
    const restored: EdlSegment =
      seg.kind === 'clip'
        ? { ...seg, inMs: 0, outMs: clip.durationMs, cutReason: '' }
        : { ...seg, inMs: 0, outMs: clip.durationMs };
    const newSegments = [...edl.segments];
    newSegments[idx] = restored;
    patchEdl.mutate({ ...edl, segments: newSegments });
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <ScrollArea type="hover" offsetScrollbars>
          <Stack gap={6} style={{ minWidth: totalWidthPx }}>
            <Ruler totalMs={totalMs} widthPx={totalWidthPx} />
            <TrackRow label="Video">
              <VideoTrack
                items={videoItems}
                clipsLookup={clipsLookup}
                onReorder={handleReorder}
                onRestoreClip={handleRestoreClip}
                readOnly={readOnly}
              />
            </TrackRow>
            <TrackRow label="Música">
              <MusicTrack
                projectId={projectId}
                sections={edl.music.sections}
                totalMs={totalMs}
                onChanged={onChanged}
              />
            </TrackRow>
            <TrackRow label="Voz">
              <VoTrack cues={edl.voiceover.cues} totalMs={totalMs} />
            </TrackRow>
          </Stack>
        </ScrollArea>
      </Stack>
    </Paper>
  );
}

function TrackRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
      <div
        style={{
          width: 60,
          flexShrink: 0,
          fontSize: 12,
          color: 'var(--mantine-color-dimmed)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1, position: 'relative', height: TRACK_HEIGHT }}>{children}</div>
    </div>
  );
}

function Ruler({ totalMs, widthPx }: { totalMs: number; widthPx: number }) {
  const totalSec = totalMs / 1000;
  const step = totalSec > 60 ? 10 : totalSec > 30 ? 5 : 2;
  const ticks: number[] = [];
  for (let s = 0; s <= totalSec; s += step) ticks.push(s);

  return (
    <div style={{ marginLeft: 68, position: 'relative', height: 20, minWidth: widthPx }}>
      {ticks.map((s) => (
        <div
          key={s}
          style={{
            position: 'absolute',
            left: s * PX_PER_SEC,
            top: 0,
            fontSize: 10,
            color: 'var(--mantine-color-dimmed)',
          }}
        >
          {s}s
        </div>
      ))}
    </div>
  );
}
