'use client';

import { Text, Tooltip } from '@mantine/core';
import { SegmentLayout, PX_PER_SEC } from './Timeline';
import { ClipMeta } from './Editor';

export function VideoTrack({
  layout,
  clipsLookup,
}: {
  layout: SegmentLayout[];
  clipsLookup: Record<string, ClipMeta>;
}) {
  return (
    <>
      {layout.map(({ idx, seg, startMs, widthPx }) => {
        const isClip = seg.kind === 'clip';
        const filename = isClip ? clipsLookup[seg.clipId]?.filename ?? seg.clipId : 'VO + B-roll';
        const detail = isClip
          ? `${(seg.inMs / 1000).toFixed(1)}s → ${(seg.outMs / 1000).toFixed(1)}s`
          : seg.script;

        return (
          <Tooltip key={idx} label={detail} multiline w={300} withinPortal>
            <div
              style={{
                position: 'absolute',
                left: (startMs / 1000) * PX_PER_SEC,
                width: Math.max(20, widthPx - 2),
                height: '100%',
                background: isClip ? 'var(--mantine-color-blue-light)' : 'var(--mantine-color-grape-light)',
                borderRadius: 4,
                padding: '4px 6px',
                overflow: 'hidden',
                fontSize: 11,
                lineHeight: 1.2,
                color: 'var(--mantine-color-text)',
                cursor: 'default',
              }}
            >
              <div style={{ fontWeight: 600 }}>{idx + 1}. {isClip ? 'clip' : 'VO'}</div>
              <Text size="xs" lineClamp={2} c="dimmed">{filename}</Text>
            </div>
          </Tooltip>
        );
      })}
    </>
  );
}
