'use client';

import { Tooltip } from '@mantine/core';
import { MusicSection } from '@/lib/edl';
import { PX_PER_SEC } from './Timeline';

export function MusicTrack({
  projectId: _projectId,
  sections,
  totalMs: _totalMs,
  onChanged: _onChanged,
}: {
  projectId: string;
  sections: MusicSection[];
  totalMs: number;
  onChanged: () => void;
}) {
  if (sections.length === 0) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          color: 'var(--mantine-color-dimmed)',
        }}
      >
        Sin secciones musicales (silencio total)
      </div>
    );
  }

  return (
    <>
      {sections.map((sec) => {
        const left = (sec.startMs / 1000) * PX_PER_SEC;
        const width = Math.max(20, ((sec.endMs - sec.startMs) / 1000) * PX_PER_SEC - 2);
        const hasTrack = !!sec.trackUrl;
        const bg = hasTrack ? 'var(--mantine-color-teal-light)' : 'var(--mantine-color-gray-3)';
        return (
          <Tooltip
            key={sec.id}
            label={`${sec.mood} · ${sec.energy} · query: ${sec.query} · ${sec.reason}`}
            multiline
            w={320}
            withinPortal
          >
            <div
              style={{
                position: 'absolute',
                left,
                width,
                height: '100%',
                background: bg,
                borderRadius: 4,
                padding: '4px 6px',
                overflow: 'hidden',
                fontSize: 11,
                border: hasTrack ? '1px solid var(--mantine-color-teal-6)' : '1px dashed var(--mantine-color-gray-5)',
                color: 'var(--mantine-color-text)',
              }}
            >
              <div style={{ fontWeight: 600 }}>{sec.mood}</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>
                {sec.energy}
                {hasTrack ? ` · ${sec.trackTitle ?? 'track'}` : ' · sin track'}
              </div>
            </div>
          </Tooltip>
        );
      })}
    </>
  );
}
