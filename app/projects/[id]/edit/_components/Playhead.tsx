'use client';

import { useRef } from 'react';

export function Playhead({
  currentMs,
  totalMs,
  leftOffset,
  pxPerSec,
  height,
  containerRef,
  onSeekMs,
}: {
  currentMs: number;
  totalMs: number;
  leftOffset: number;
  pxPerSec: number;
  height: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSeekMs: (ms: number) => void;
}) {
  const draggingRef = useRef(false);

  const computeMsFromClientX = (clientX: number): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return currentMs;
    const xWithinContent = clientX - rect.left - leftOffset;
    const ms = Math.max(0, Math.min(totalMs, (xWithinContent / pxPerSec) * 1000));
    return ms;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    onSeekMs(computeMsFromClientX(e.clientX));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const rawLeft = leftOffset + (currentMs / 1000) * pxPerSec;
  const left = Number.isFinite(rawLeft) ? rawLeft : leftOffset;

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: 0,
        height,
        width: 2,
        background: 'var(--mantine-color-red-7)',
        pointerEvents: 'none',
        zIndex: 50,
        transform: 'translateX(-1px)',
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: 'absolute',
          top: -6,
          left: -7,
          width: 16,
          height: 16,
          background: 'var(--mantine-color-red-7)',
          borderRadius: 3,
          cursor: 'ew-resize',
          pointerEvents: 'auto',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
        aria-label="Playhead — arrastrar para moverse en el tiempo"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={totalMs}
        aria-valuenow={currentMs}
      />
    </div>
  );
}
