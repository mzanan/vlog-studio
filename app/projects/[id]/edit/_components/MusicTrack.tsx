'use client';

import { useState } from 'react';
import { Tooltip } from '@mantine/core';
import { MusicSection } from '@/lib/edl';
import { Suggestion } from '@/lib/suggestions';
import { SuggestionActions } from './SuggestionActions';

const DEFAULT_NEW_SECTION_MS = 30000; // 30s por default cuando inserta en gap

export function MusicTrack({
  sections,
  suggestions,
  pxPerSec,
  totalMs,
  onPick,
  onInsert,
  onAcceptSuggestion,
  onRejectSuggestion,
  onChatSuggestion,
}: {
  sections: MusicSection[];
  suggestions: Suggestion[];
  pxPerSec: number;
  totalMs: number;
  onPick?: (section: MusicSection) => void;
  onInsert?: (startMs: number, endMs: number) => void;
  onAcceptSuggestion: (id: string) => void;
  onRejectSuggestion: (id: string) => void;
  onChatSuggestion: (id: string) => void;
}) {
  const addSuggestions = suggestions.filter((s) => s.type === 'add-music-section');
  const replaceSuggestions = suggestions.filter((s) => s.type === 'replace-music-track');

  const [hoverMs, setHoverMs] = useState<number | null>(null);

  // Computa el "slot vacío" alrededor de un ms dado (gap entre occupied ranges).
  // Considera tanto sections existentes como add-suggestions para no proponer
  // insertar encima de algo ya marcado.
  const occupied: Array<{ startMs: number; endMs: number }> = [
    ...sections.map((s) => ({ startMs: s.startMs, endMs: s.endMs })),
    ...addSuggestions
      .map((s) => (s.type === 'add-music-section' ? s.data.section : null))
      .filter((s): s is { startMs: number; endMs: number } & MusicSection => !!s)
      .map((s) => ({ startMs: s.startMs, endMs: s.endMs })),
  ].sort((a, b) => a.startMs - b.startMs);

  const isOccupied = (ms: number): boolean =>
    occupied.some((o) => ms >= o.startMs && ms < o.endMs);

  const gapAround = (ms: number): { startMs: number; endMs: number } | null => {
    if (isOccupied(ms)) return null;
    let gapStart = 0;
    let gapEnd = totalMs;
    for (const o of occupied) {
      if (o.endMs <= ms && o.endMs > gapStart) gapStart = o.endMs;
      if (o.startMs >= ms && o.startMs < gapEnd) gapEnd = o.startMs;
    }
    if (gapEnd <= gapStart) return null;
    // Snap a una ventana de DEFAULT_NEW_SECTION_MS centrada en ms, pero contenida en el gap.
    const half = DEFAULT_NEW_SECTION_MS / 2;
    let start = Math.max(gapStart, ms - half);
    let end = Math.min(gapEnd, start + DEFAULT_NEW_SECTION_MS);
    start = Math.max(gapStart, end - DEFAULT_NEW_SECTION_MS);
    return { startMs: start, endMs: end };
  };

  const computeMs = (clientX: number, rect: DOMRect): number => {
    return Math.max(0, Math.min(totalMs, ((clientX - rect.left) / pxPerSec) * 1000));
  };

  const handleHoverMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) {
      setHoverMs(null);
      return;
    }
    const ms = computeMs(e.clientX, e.currentTarget.getBoundingClientRect());
    setHoverMs(isOccupied(ms) ? null : ms);
  };
  const handleHoverLeave = () => setHoverMs(null);
  const handleClickEmpty = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (!onInsert) return;
    const ms = computeMs(e.clientX, e.currentTarget.getBoundingClientRect());
    const gap = gapAround(ms);
    if (!gap) return;
    onInsert(gap.startMs, gap.endMs);
  };

  const hoverGap = hoverMs !== null ? gapAround(hoverMs) : null;

  return (
    <div
      onPointerMove={handleHoverMove}
      onPointerLeave={handleHoverLeave}
      onClick={handleClickEmpty}
      style={{ position: 'absolute', inset: 0, cursor: onInsert ? 'copy' : 'default' }}
    >
      {sections.length === 0 && addSuggestions.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color: 'var(--mantine-color-dimmed)',
            pointerEvents: 'none',
          }}
        >
          Sin secciones musicales (click acá para insertar)
        </div>
      )}

      {hoverGap && (
        <div
          style={{
            position: 'absolute',
            left: (hoverGap.startMs / 1000) * pxPerSec,
            width: Math.max(4, ((hoverGap.endMs - hoverGap.startMs) / 1000) * pxPerSec),
            top: 0,
            height: '100%',
            background: 'rgba(100, 200, 180, 0.18)',
            border: '2px dashed var(--mantine-color-teal-5)',
            borderRadius: 4,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            color: 'var(--mantine-color-teal-7)',
            fontWeight: 600,
          }}
        >
          + insertar música
        </div>
      )}

      {sections.map((sec) => {
        const left = (sec.startMs / 1000) * pxPerSec;
        const width = Math.max(20, ((sec.endMs - sec.startMs) / 1000) * pxPerSec - 2);
        const hasTrack = !!sec.trackUrl;
        const clickable = !!onPick;
        const bg = hasTrack ? 'var(--mantine-color-teal-light)' : 'var(--mantine-color-gray-3)';
        const replaceSug = replaceSuggestions.find(
          (s) => s.type === 'replace-music-track' && s.data.sectionId === sec.id,
        );
        const tooltipLabel = clickable
          ? `${sec.mood} · ${sec.energy} · query: ${sec.query}\n${sec.reason}\nClick para elegir música`
          : `${sec.mood} · ${sec.energy} · query: ${sec.query} · ${sec.reason}`;
        return (
          <Tooltip key={sec.id} label={tooltipLabel} multiline w={320} withinPortal>
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (clickable && onPick) onPick(sec);
              }}
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
                cursor: clickable ? 'pointer' : 'default',
              }}
            >
              <div style={{ fontWeight: 600 }}>{sec.mood}</div>
              <div style={{ fontSize: 10, opacity: 0.7 }}>
                {sec.energy}
                {hasTrack ? ` · ${sec.trackTitle ?? 'track'}` : ' · sin track'}
              </div>
              {replaceSug && replaceSug.type === 'replace-music-track' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    background: 'var(--mantine-color-orange-7)',
                    color: 'white',
                    fontSize: 9,
                    fontWeight: 600,
                    padding: '1px 4px',
                    borderRadius: 2,
                    display: 'flex',
                    gap: 4,
                    alignItems: 'center',
                  }}
                >
                  AI: {replaceSug.data.next.query}
                  <SuggestionActions
                    onAccept={() => onAcceptSuggestion(replaceSug.id)}
                    onReject={() => onRejectSuggestion(replaceSug.id)}
                    onChat={() => onChatSuggestion(replaceSug.id)}
                  />
                </div>
              )}
            </div>
          </Tooltip>
        );
      })}

      {addSuggestions.map((s) => {
        if (s.type !== 'add-music-section') return null;
        const sec = s.data.section;
        const left = (sec.startMs / 1000) * pxPerSec;
        const width = Math.max(20, ((sec.endMs - sec.startMs) / 1000) * pxPerSec - 2);
        const label = `AI propone: ${sec.mood} · ${sec.energy} · query: ${sec.query}\n${sec.reason}`;
        return (
          <Tooltip key={s.id} label={label} multiline w={320} withinPortal>
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                left,
                width,
                height: '100%',
                background: 'rgba(0, 200, 150, 0.10)',
                borderRadius: 4,
                padding: '4px 6px',
                overflow: 'hidden',
                fontSize: 11,
                border: '2px dashed var(--mantine-color-teal-6)',
                color: 'var(--mantine-color-text)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 10 }}>AI: {sec.mood}</div>
                <div style={{ fontSize: 9, opacity: 0.8 }}>{sec.energy} · {sec.query}</div>
              </div>
              <div style={{ alignSelf: 'flex-end' }}>
                <SuggestionActions
                  onAccept={() => onAcceptSuggestion(s.id)}
                  onReject={() => onRejectSuggestion(s.id)}
                  onChat={() => onChatSuggestion(s.id)}
                />
              </div>
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}
