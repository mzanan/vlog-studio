'use client';

import { useQuery } from '@tanstack/react-query';
import { Anchor, Tooltip } from '@mantine/core';
import { SegmentLayout, PX_PER_SEC } from './Timeline';

type VoStatus = { recorded: boolean; durationMs?: number };

export function VoTrack({
  projectId,
  layout,
  onChanged: _onChanged,
}: {
  projectId: string;
  layout: SegmentLayout[];
  onChanged: () => void;
}) {
  const voSegments = layout.filter((l) => l.seg.kind === 'voiceover');

  return (
    <>
      {voSegments.map(({ idx, seg, startMs, widthPx }) => (
        <VoChip
          key={idx}
          projectId={projectId}
          idx={idx}
          startMs={startMs}
          widthPx={widthPx}
          script={seg.kind === 'voiceover' ? seg.script : ''}
        />
      ))}
    </>
  );
}

function VoChip({
  projectId,
  idx,
  startMs,
  widthPx,
  script,
}: {
  projectId: string;
  idx: number;
  startMs: number;
  widthPx: number;
  script: string;
}) {
  const status = useQuery({
    queryKey: ['vo', projectId, idx],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/vo/${idx}`);
      if (!res.ok) return { recorded: false } as VoStatus;
      return (await res.json()) as VoStatus;
    },
  });

  const recorded = status.data?.recorded === true;
  const bg = recorded ? 'var(--mantine-color-orange-light)' : 'var(--mantine-color-gray-3)';

  return (
    <Tooltip label={script || '(sin script)'} multiline w={300} withinPortal>
      <Anchor href={`/projects/${projectId}/record`} style={{ textDecoration: 'none' }}>
        <div
          style={{
            position: 'absolute',
            left: (startMs / 1000) * PX_PER_SEC,
            width: Math.max(20, widthPx - 2),
            height: '100%',
            background: bg,
            borderRadius: 4,
            padding: '4px 6px',
            overflow: 'hidden',
            fontSize: 11,
            cursor: 'pointer',
            border: recorded ? '1px solid var(--mantine-color-orange-6)' : '1px dashed var(--mantine-color-gray-5)',
            color: 'var(--mantine-color-text)',
          }}
        >
          <div style={{ fontWeight: 600 }}>VO #{idx + 1}</div>
          <div style={{ fontSize: 10, opacity: 0.7 }}>{recorded ? '✓ grabado' : 'sin grabar'}</div>
        </div>
      </Anchor>
    </Tooltip>
  );
}
