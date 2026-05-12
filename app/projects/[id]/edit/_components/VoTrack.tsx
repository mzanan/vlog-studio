'use client';

import { Tooltip } from '@mantine/core';
import { EdlVoiceoverCue } from '@/lib/edl';
import { PX_PER_SEC } from './Timeline';

export function VoTrack({ cues, totalMs: _totalMs }: { cues: EdlVoiceoverCue[]; totalMs: number }) {
  if (cues.length === 0) {
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
        Sin voiceover en este plan
      </div>
    );
  }

  return (
    <>
      {cues.map((cue, idx) => {
        const startPx = (cue.startMs / 1000) * PX_PER_SEC;
        const widthPx = Math.max(20, ((cue.endMs - cue.startMs) / 1000) * PX_PER_SEC - 2);
        return (
          <Tooltip key={idx} label={cue.text} multiline w={300} withinPortal>
            <div
              style={{
                position: 'absolute',
                left: startPx,
                width: widthPx,
                height: '100%',
                background: 'var(--mantine-color-orange-light)',
                border: '1px solid var(--mantine-color-orange-6)',
                borderRadius: 4,
                padding: '4px 6px',
                overflow: 'hidden',
                fontSize: 11,
                color: 'var(--mantine-color-text)',
              }}
            >
              <div style={{ fontWeight: 600 }}>VO #{idx + 1}</div>
              <div style={{ fontSize: 10, opacity: 0.7, lineHeight: 1.1 }}>
                {cue.text.slice(0, 60)}
                {cue.text.length > 60 ? '…' : ''}
              </div>
            </div>
          </Tooltip>
        );
      })}
    </>
  );
}
