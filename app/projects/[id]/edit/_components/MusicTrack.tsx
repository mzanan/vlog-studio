'use client';

import { useMutation } from '@tanstack/react-query';
import { FileButton, Menu, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { MusicBlock, mergeWithNext, splitBlockAt } from '@/lib/music';
import { SegmentLayout, PX_PER_SEC } from './Timeline';

export function MusicTrack({
  projectId,
  layout,
  blocks,
  totalWidthPx,
  onChanged,
}: {
  projectId: string;
  layout: SegmentLayout[];
  blocks: MusicBlock[];
  totalWidthPx: number;
  onChanged: () => void;
}) {
  if (blocks.length === 0) {
    return <div style={{ color: 'var(--mantine-color-dimmed)', fontSize: 12, padding: 4 }}>Sin bloques</div>;
  }

  return (
    <>
      {blocks.map((block, i) => (
        <MusicBlockChip
          key={block.id}
          projectId={projectId}
          block={block}
          layout={layout}
          blocks={blocks}
          isLast={i === blocks.length - 1}
          onChanged={onChanged}
        />
      ))}
    </>
  );
}

function MusicBlockChip({
  projectId,
  block,
  layout,
  blocks,
  isLast,
  onChanged,
}: {
  projectId: string;
  block: MusicBlock;
  layout: SegmentLayout[];
  blocks: MusicBlock[];
  isLast: boolean;
  onChanged: () => void;
}) {
  const start = layout[block.startSegmentIdx];
  const end = layout[block.endSegmentIdx];
  if (!start || !end) return null;

  const left = (start.startMs / 1000) * PX_PER_SEC;
  const right = ((end.startMs + end.widthPx / PX_PER_SEC * 1000) / 1000) * PX_PER_SEC;
  const width = Math.max(20, right - left - 2);

  const saveBlocks = useMutation({
    mutationFn: async (next: MusicBlock[]) => {
      const res = await fetch(`/api/projects/${projectId}/music`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks: next }),
      });
      if (!res.ok) throw new Error('falló');
    },
    onSuccess: onChanged,
    onError: (err) => notifications.show({ color: 'red', message: err.message }),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/projects/${projectId}/music/${block.id}/audio`, { method: 'POST', body: form });
      if (!res.ok) throw new Error((await res.json()).error ?? 'falló');
    },
    onSuccess: () => {
      onChanged();
      notifications.show({ color: 'teal', message: 'Track subido' });
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message }),
  });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/music/${block.id}/generate`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json()).error ?? 'falló');
    },
    onMutate: () => notifications.show({
      id: `gen-${block.id}`,
      loading: true,
      title: 'Generando música',
      message: 'MusicGen tarda varios minutos según largo.',
      autoClose: false,
      withCloseButton: false,
    }),
    onSuccess: () => {
      notifications.hide(`gen-${block.id}`);
      onChanged();
      notifications.show({ color: 'teal', message: 'Track generado' });
    },
    onError: (err) => {
      notifications.hide(`gen-${block.id}`);
      notifications.show({ color: 'red', message: err.message, autoClose: 8000 });
    },
  });

  const deleteAudio = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/music/${block.id}/audio`, { method: 'DELETE' });
      if (!res.ok) throw new Error('falló');
    },
    onSuccess: onChanged,
    onError: (err) => notifications.show({ color: 'red', message: err.message }),
  });

  const splitOptions: number[] = [];
  for (let i = block.startSegmentIdx + 1; i <= block.endSegmentIdx; i++) splitOptions.push(i);

  const hasAudio = !!block.audioExt;
  const bg = hasAudio ? 'var(--mantine-color-teal-light)' : 'var(--mantine-color-gray-3)';

  return (
    <Tooltip label={`${block.mood} · ${block.energy}${hasAudio ? ' · ' + block.audioExt : ''}`} withinPortal>
      <Menu position="bottom-start" withinPortal shadow="md">
        <Menu.Target>
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
              cursor: 'pointer',
              border: hasAudio ? '1px solid var(--mantine-color-teal-6)' : '1px dashed var(--mantine-color-gray-5)',
              color: 'var(--mantine-color-text)',
            }}
          >
            <div style={{ fontWeight: 600 }}>{block.mood}</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>{block.energy}{hasAudio ? '' : ' · sin track'}</div>
          </div>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Bloque #{block.startSegmentIdx + 1}–{block.endSegmentIdx + 1}</Menu.Label>
          <FileButton
            onChange={(f) => f && upload.mutate(f)}
            accept="audio/*"
          >
            {(props) => <Menu.Item {...props}>{hasAudio ? 'Reemplazar track' : 'Subir track'}</Menu.Item>}
          </FileButton>
          <Menu.Item onClick={() => generate.mutate()}>Generar AI</Menu.Item>
          {hasAudio && <Menu.Item color="red" onClick={() => deleteAudio.mutate()}>Borrar track</Menu.Item>}
          {splitOptions.length > 0 && (
            <>
              <Menu.Divider />
              <Menu.Label>Dividir antes de…</Menu.Label>
              {splitOptions.map((at) => (
                <Menu.Item key={at} onClick={() => saveBlocks.mutate(splitBlockAt(blocks, block.id, at))}>
                  segmento {at + 1}
                </Menu.Item>
              ))}
            </>
          )}
          {!isLast && (
            <>
              <Menu.Divider />
              <Menu.Item onClick={() => saveBlocks.mutate(mergeWithNext(blocks, block.id))}>
                Unir con siguiente
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
    </Tooltip>
  );
}
