'use client';

import { useMemo } from 'react';
import { Paper, ScrollArea, Stack } from '@mantine/core';
import { Edl, EdlSegment, segmentDurationMs } from '@/lib/edl';
import { ClipMeta } from './Editor';
import { VideoTrack } from './VideoTrack';
import { MusicTrack } from './MusicTrack';
import { VoTrack } from './VoTrack';

export const PX_PER_SEC = 50;
export const TRACK_HEIGHT = 64;

export type SegmentLayout = { idx: number; seg: EdlSegment; startMs: number; widthPx: number };

export function Timeline({
  projectId,
  edl,
  clips,
  onChanged,
}: {
  projectId: string;
  edl: Edl;
  clips: ClipMeta[];
  onChanged: () => void;
}) {
  const layout = useMemo<SegmentLayout[]>(() => {
    const out: SegmentLayout[] = [];
    let startMs = 0;
    edl.segments.forEach((seg, idx) => {
      const dms = segmentDurationMs(seg);
      out.push({ idx, seg, startMs, widthPx: (dms / 1000) * PX_PER_SEC });
      startMs += dms;
    });
    return out;
  }, [edl.segments]);

  const totalMs = layout.reduce((acc, l) => acc + segmentDurationMs(l.seg), 0);
  const totalWidthPx = Math.max(600, (totalMs / 1000) * PX_PER_SEC + 40);

  const clipsLookup = useMemo(() => Object.fromEntries(clips.map((c) => [c.id, c])), [clips]);

  return (
    <Paper withBorder p="md">
      <Stack gap="xs">
        <Ruler totalMs={totalMs} widthPx={totalWidthPx} />
        <ScrollArea type="hover" offsetScrollbars>
          <Stack gap={6} style={{ minWidth: totalWidthPx }}>
            <TrackRow label="Video">
              <VideoTrack layout={layout} clipsLookup={clipsLookup} />
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
  const seconds = Math.ceil(totalMs / 1000);
  const ticks: number[] = [];
  const step = seconds > 60 ? 10 : seconds > 30 ? 5 : 2;
  for (let s = 0; s <= seconds; s += step) ticks.push(s);

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
