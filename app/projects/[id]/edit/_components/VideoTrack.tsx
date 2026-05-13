'use client';

import { ActionIcon, Text, Tooltip } from '@mantine/core';
import { IconArrowBackUp } from '@tabler/icons-react';
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
import { ClipMeta } from './Editor';

export type VideoSegmentItem = {
  id: string;
  idx: number;
  seg: EdlSegment;
  widthPx: number;
};

export function VideoTrack({
  items,
  clipsLookup,
  onReorder,
  onRestoreClip,
  readOnly = false,
}: {
  items: VideoSegmentItem[];
  clipsLookup: Record<string, ClipMeta>;
  onReorder: (newOrder: string[]) => void;
  onRestoreClip: (segmentItemId: string) => void;
  readOnly?: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    if (readOnly) return;
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
            return (
              <SegmentBlock
                key={item.id}
                item={item}
                filename={clip?.filename ?? item.seg.clipId}
                fullDurationMs={clip?.durationMs ?? item.seg.outMs}
                onRestore={() => onRestoreClip(item.id)}
                readOnly={readOnly}
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
  readOnly,
}: {
  item: VideoSegmentItem;
  filename: string;
  fullDurationMs: number;
  onRestore: () => void;
  readOnly: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: readOnly,
  });
  const isClip = item.seg.kind === 'clip';
  const cutReason = isClip ? (item.seg as { cutReason?: string }).cutReason ?? '' : '';
  const trimmedMs = (item.seg.inMs > 0 ? item.seg.inMs : 0) + Math.max(0, fullDurationMs - item.seg.outMs);
  const isTrimmed = trimmedMs > 0;
  const detail = isClip
    ? `${(item.seg.inMs / 1000).toFixed(1)}s → ${(item.seg.outMs / 1000).toFixed(1)}s${cutReason ? ` · ${cutReason}` : ''}`
    : `B-roll silenciado · ${(item.seg.inMs / 1000).toFixed(1)}s → ${(item.seg.outMs / 1000).toFixed(1)}s`;

  const style: React.CSSProperties = {
    position: 'relative',
    width: Math.max(20, item.widthPx - 2),
    height: '100%',
    background: isClip ? 'var(--mantine-color-blue-light)' : 'var(--mantine-color-grape-light)',
    borderRadius: 4,
    padding: '4px 6px',
    overflow: 'hidden',
    fontSize: 11,
    lineHeight: 1.2,
    color: 'var(--mantine-color-text)',
    cursor: readOnly ? 'default' : isDragging ? 'grabbing' : 'grab',
    flexShrink: 0,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 10 : 1,
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
        {isTrimmed && !readOnly && (
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
