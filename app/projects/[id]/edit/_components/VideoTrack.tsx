'use client';

import { useMemo } from 'react';
import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { IconArrowBackUp, IconEye, IconEyeOff } from '@tabler/icons-react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EdlSegment } from '@/lib/edl';
import { Suggestion } from '@/lib/suggestions';
import { ClipMeta } from './Editor';
import { SuggestionActions } from './SuggestionActions';

export type VideoSegmentItem = {
  id: string;
  idx: number;
  seg: EdlSegment;
  widthPx: number;
};

type SegmentSuggestions = {
  trims: Suggestion[];      // trim-segment for this seg.id
  splits: Suggestion[];     // split-segment for this seg.id
  hides: Suggestion[];      // hide-clip for this seg.clipId
};

export function VideoTrack({
  items,
  clipsLookup,
  suggestions,
  onReorder,
  onRestoreClip,
  onAcceptSuggestion,
  onRejectSuggestion,
  onChatSuggestion,
  previewExcluded,
  onTogglePreviewSuggestion,
}: {
  items: VideoSegmentItem[];
  clipsLookup: Record<string, ClipMeta>;
  suggestions: Suggestion[];
  onReorder: (newOrder: string[]) => void;
  onRestoreClip: (segmentItemId: string) => void;
  onAcceptSuggestion: (id: string) => void;
  onRejectSuggestion: (id: string) => void;
  onChatSuggestion: (id: string) => void;
  previewExcluded: string[];
  onTogglePreviewSuggestion: (id: string) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const suggestionsBySegment = useMemo(() => {
    const map = new Map<string, SegmentSuggestions>();
    for (const it of items) {
      map.set(it.id, { trims: [], splits: [], hides: [] });
    }
    for (const s of suggestions) {
      if (s.type === 'trim-segment') {
        const bucket = map.get(s.data.segmentId);
        if (bucket) bucket.trims.push(s);
      } else if (s.type === 'split-segment') {
        const bucket = map.get(s.data.segmentId);
        if (bucket) bucket.splits.push(s);
      } else if (s.type === 'hide-clip') {
        for (const it of items) {
          if (it.seg.clipId === s.data.clipId) {
            map.get(it.id)?.hides.push(s);
          }
        }
      }
    }
    return map;
  }, [items, suggestions]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((it) => it.id === active.id);
    const newIndex = items.findIndex((it) => it.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(items, oldIndex, newIndex);
    onReorder(reordered.map((it) => it.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((it) => it.id)} strategy={horizontalListSortingStrategy}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'stretch',
            gap: 2,
          }}
        >
          {items.map((item) => {
            const clip = clipsLookup[item.seg.clipId];
            const sugs = suggestionsBySegment.get(item.id) ?? { trims: [], splits: [], hides: [] };
            return (
              <SegmentBlock
                key={item.id}
                item={item}
                filename={clip?.filename ?? item.seg.clipId}
                fullDurationMs={clip?.durationMs ?? item.seg.outMs}
                onRestore={() => onRestoreClip(item.id)}
                suggestions={sugs}
                onAcceptSuggestion={onAcceptSuggestion}
                onRejectSuggestion={onRejectSuggestion}
                onChatSuggestion={onChatSuggestion}
                previewExcluded={previewExcluded}
                onTogglePreviewSuggestion={onTogglePreviewSuggestion}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SegmentBlock({
  item,
  filename,
  fullDurationMs,
  onRestore,
  suggestions,
  onAcceptSuggestion,
  onRejectSuggestion,
  onChatSuggestion,
  previewExcluded,
  onTogglePreviewSuggestion,
}: {
  item: VideoSegmentItem;
  filename: string;
  fullDurationMs: number;
  onRestore: () => void;
  suggestions: SegmentSuggestions;
  onAcceptSuggestion: (id: string) => void;
  onRejectSuggestion: (id: string) => void;
  onChatSuggestion: (id: string) => void;
  previewExcluded: string[];
  onTogglePreviewSuggestion: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const isClip = item.seg.kind === 'clip';
  const cutReason = isClip ? (item.seg as { cutReason?: string }).cutReason ?? '' : '';
  const trimmedMs = (item.seg.inMs > 0 ? item.seg.inMs : 0) + Math.max(0, fullDurationMs - item.seg.outMs);
  const isTrimmed = trimmedMs > 0;
  const segDurationMs = item.seg.outMs - item.seg.inMs;
  const hasHideSug = suggestions.hides.length > 0;
  const brollSpeed = !isClip ? (item.seg as { speed?: number }).speed ?? 1 : 1;
  const speedLabel = brollSpeed !== 1 ? ` · ${brollSpeed}x` : '';
  const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  const trimSug = suggestions.trims.find((s) => s.type === 'trim-segment');
  let durationLabel = `${secs(segDurationMs / brollSpeed)}${speedLabel}`;
  if (trimSug && trimSug.type === 'trim-segment') {
    const sugSpeed = trimSug.data.newSpeed ?? 1;
    const sugMs = (trimSug.data.newOutMs - trimSug.data.newInMs) / sugSpeed;
    durationLabel = `${secs(segDurationMs / brollSpeed)} → ${secs(sugMs)}${sugSpeed !== 1 ? ` (${sugSpeed}x)` : ''}`;
  }
  const detail = isClip
    ? `${durationLabel}${cutReason ? ` · ${cutReason}` : ''}`
    : `B-roll · ${durationLabel}`;

  const blockWidth = Math.max(20, item.widthPx - 2);

  const style: React.CSSProperties = {
    position: 'relative',
    width: blockWidth,
    height: '100%',
    background: isClip ? 'var(--mantine-color-blue-light)' : 'var(--mantine-color-grape-light)',
    borderRadius: 4,
    padding: '4px 6px',
    overflow: 'hidden',
    fontSize: 11,
    lineHeight: 1.2,
    color: 'var(--mantine-color-text)',
    cursor: isDragging ? 'grabbing' : 'grab',
    flexShrink: 0,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : hasHideSug ? 0.4 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  // Helper: map ms (absolutos en el clip original) a x dentro del block.
  const msToX = (ms: number) => {
    const clamped = Math.max(item.seg.inMs, Math.min(item.seg.outMs, ms));
    const ratio = segDurationMs > 0 ? (clamped - item.seg.inMs) / segDurationMs : 0;
    return ratio * blockWidth;
  };

  return (
    <Tooltip label={detail} multiline w={300} withinPortal disabled={isDragging}>
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <div style={{ fontWeight: 600 }}>
          {item.idx + 1}. {isClip ? 'clip' : 'b-roll'}
        </div>
        <Text size="xs" lineClamp={2} c="dimmed">
          {filename}
        </Text>

        {/* Hide-clip overlay */}
        {hasHideSug && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              zIndex: 3,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                background: 'var(--mantine-color-red-9)',
                color: 'white',
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 3,
                pointerEvents: 'auto',
              }}
            >
              AI: ocultar
            </div>
            <div style={{ pointerEvents: 'auto' }}>
              <SuggestionActions
                onAccept={() => onAcceptSuggestion(suggestions.hides[0].id)}
                onReject={() => onRejectSuggestion(suggestions.hides[0].id)}
                onChat={() => onChatSuggestion(suggestions.hides[0].id)}
              />
            </div>
          </div>
        )}

        {/* Trim-segment overlays */}
        {!hasHideSug && suggestions.trims.map((s) => {
          if (s.type !== 'trim-segment') return null;
          const left = msToX(s.data.newInMs);
          const right = msToX(s.data.newOutMs);
          const width = Math.max(4, right - left);
          return (
            <TrimOverlay
              key={s.id}
              left={left}
              width={width}
              label={s.rationale}
              onAccept={() => onAcceptSuggestion(s.id)}
              onReject={() => onRejectSuggestion(s.id)}
              onChat={() => onChatSuggestion(s.id)}
              previewOff={previewExcluded.includes(s.id)}
              onTogglePreview={() => onTogglePreviewSuggestion(s.id)}
            />
          );
        })}

        {/* Split-segment overlays */}
        {!hasHideSug && suggestions.splits.map((s) => {
          if (s.type !== 'split-segment') return null;
          return (
            <SplitOverlay
              key={s.id}
              splits={s.data.splits.map((sp) => ({
                left: msToX(sp.inMs),
                width: Math.max(4, msToX(sp.outMs) - msToX(sp.inMs)),
                reason: sp.cutReason,
              }))}
              rationale={s.rationale}
              onAccept={() => onAcceptSuggestion(s.id)}
              onReject={() => onRejectSuggestion(s.id)}
              onChat={() => onChatSuggestion(s.id)}
            />
          );
        })}

        {isTrimmed && (
          <Tooltip label={`Restaurar duración completa (recortado ${(trimmedMs / 1000).toFixed(1)}s)`} withinPortal>
            <ActionIcon
              size="xs"
              variant="filled"
              color="gray"
              style={{ position: 'absolute', top: 4, right: 4, zIndex: 2 }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRestore();
              }}
              aria-label="Restaurar duración completa"
            >
              <IconArrowBackUp size={12} />
            </ActionIcon>
          </Tooltip>
        )}
      </div>
    </Tooltip>
  );
}

function TrimOverlay({
  left,
  width,
  label,
  onAccept,
  onReject,
  onChat,
  previewOff,
  onTogglePreview,
}: {
  left: number;
  width: number;
  label: string;
  onAccept: () => void;
  onReject: () => void;
  onChat: () => void;
  previewOff: boolean;
  onTogglePreview: () => void;
}) {
  return (
    <Tooltip label={label} withinPortal>
      <div
        style={{
          position: 'absolute',
          left,
          top: 0,
          width,
          height: '100%',
          border: `2px dashed var(--mantine-color-${previewOff ? 'gray-6' : 'teal-6'})`,
          background: previewOff ? 'rgba(120, 120, 120, 0.12)' : 'rgba(0, 200, 150, 0.12)',
          borderRadius: 3,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      >
        <div
          style={{
            position: 'absolute',
            bottom: 2,
            right: 2,
            pointerEvents: 'auto',
            display: 'flex',
            gap: 4,
            alignItems: 'center',
          }}
        >
          <Tooltip label={previewOff ? 'Viendo original: volver a aplicar la sugerencia en el preview' : 'Ver este clip original en el preview (sin la sugerencia)'} withinPortal>
            <ActionIcon size="sm" variant={previewOff ? 'filled' : 'light'} color={previewOff ? 'orange' : 'gray'} onClick={onTogglePreview}>
              {previewOff ? <IconEyeOff size={14} /> : <IconEye size={14} />}
            </ActionIcon>
          </Tooltip>
          <SuggestionActions onAccept={onAccept} onReject={onReject} onChat={onChat} />
        </div>
      </div>
    </Tooltip>
  );
}

function SplitOverlay({
  splits,
  rationale,
  onAccept,
  onReject,
  onChat,
}: {
  splits: Array<{ left: number; width: number; reason: string }>;
  rationale: string;
  onAccept: () => void;
  onReject: () => void;
  onChat: () => void;
}) {
  return (
    <>
      {splits.map((sp, i) => (
        <Tooltip key={i} label={sp.reason || rationale} withinPortal>
          <div
            style={{
              position: 'absolute',
              left: sp.left,
              top: 0,
              width: sp.width,
              height: '100%',
              border: '2px dashed var(--mantine-color-violet-6)',
              background: 'rgba(160, 80, 240, 0.12)',
              borderRadius: 3,
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        </Tooltip>
      ))}
      <div style={{ position: 'absolute', top: 2, left: 2, pointerEvents: 'auto', zIndex: 4 }}>
        <Group gap={4} wrap="nowrap">
          <div
            style={{
              background: 'var(--mantine-color-violet-8)',
              color: 'white',
              fontSize: 9,
              fontWeight: 600,
              padding: '1px 4px',
              borderRadius: 2,
            }}
          >
            AI: partir en {splits.length}
          </div>
          <SuggestionActions onAccept={onAccept} onReject={onReject} onChat={onChat} />
        </Group>
      </div>
    </>
  );
}
