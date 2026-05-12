'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  Loader,
  Menu,
  Stack,
  Text,
} from '@mantine/core';
import { IconChevronDown, IconMusic, IconScissors, IconSparkles, IconTrash, IconUpload } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { Edl, EdlSegment } from '@/lib/edl';
import { MusicBlock, hintForSegment, mergeWithNext, splitBlockAt } from '@/lib/music';

function fmtMs(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function segmentLabel(seg: EdlSegment, idx: number): string {
  if (seg.kind === 'clip') return `${idx + 1}. clip · ${fmtMs(seg.outMs - seg.inMs)}`;
  return `${idx + 1}. VO · ${fmtMs(seg.durationEstimateMs)}`;
}

function energyColor(e: MusicBlock['energy']) {
  if (e === 'low') return 'blue';
  if (e === 'mid') return 'teal';
  return 'orange';
}

export function MusicView({ projectId, edl }: { projectId: string; edl: Edl }) {
  const qc = useQueryClient();
  const [audioVersions, setAudioVersions] = useState<Record<string, number>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['music', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/music`);
      if (!res.ok) throw new Error('falló');
      return res.json() as Promise<{ blocks: MusicBlock[] }>;
    },
  });

  const saveBlocks = useMutation({
    mutationFn: async (blocks: MusicBlock[]) => {
      const res = await fetch(`/api/projects/${projectId}/music`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'falló');
      return (await res.json()).blocks as MusicBlock[];
    },
    onSuccess: (blocks) => {
      qc.setQueryData(['music', projectId], { blocks });
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message }),
  });

  const resetBlocks = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/music`, { method: 'DELETE' });
      if (!res.ok) throw new Error('falló');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['music', projectId] });
      notifications.show({ message: 'Bloques reseteados a uno solo' });
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message }),
  });

  if (isLoading) return <Loader />;
  if (!data) return <Text c="dimmed">Sin datos.</Text>;

  const blocks = data.blocks;

  if (blocks.length === 0) {
    return <Text c="dimmed">El plan no tiene segmentos.</Text>;
  }

  function bumpAudioVersion(blockId: string) {
    setAudioVersions((prev) => ({ ...prev, [blockId]: (prev[blockId] ?? 0) + 1 }));
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button variant="subtle" size="xs" onClick={() => resetBlocks.mutate()} loading={resetBlocks.isPending}>
          Resetear a un solo bloque
        </Button>
      </Group>
      {blocks.map((block, i) => (
        <BlockCard
          key={block.id}
          projectId={projectId}
          edl={edl}
          block={block}
          isLast={i === blocks.length - 1}
          audioVersion={audioVersions[block.id] ?? 0}
          onSplit={(at) => saveBlocks.mutate(splitBlockAt(blocks, block.id, at))}
          onMerge={() => saveBlocks.mutate(mergeWithNext(blocks, block.id))}
          onAudioChanged={() => {
            bumpAudioVersion(block.id);
            qc.invalidateQueries({ queryKey: ['music', projectId] });
          }}
        />
      ))}
    </Stack>
  );
}

function BlockCard({
  projectId,
  edl,
  block,
  isLast,
  audioVersion,
  onSplit,
  onMerge,
  onAudioChanged,
}: {
  projectId: string;
  edl: Edl;
  block: MusicBlock;
  isLast: boolean;
  audioVersion: number;
  onSplit: (at: number) => void;
  onMerge: () => void;
  onAudioChanged: () => void;
}) {
  const segmentsInBlock = [];
  for (let i = block.startSegmentIdx; i <= block.endSegmentIdx; i++) {
    segmentsInBlock.push({ idx: i, seg: edl.segments[i] });
  }

  const uploadAudio = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/projects/${projectId}/music/${block.id}/audio`, {
        method: 'POST',
        body: form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body;
    },
    onSuccess: () => {
      onAudioChanged();
      notifications.show({ color: 'teal', message: 'Track subido' });
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message }),
  });

  const deleteAudio = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/music/${block.id}/audio`, { method: 'DELETE' });
      if (!res.ok) throw new Error('falló');
      return res.json();
    },
    onSuccess: () => {
      onAudioChanged();
      notifications.show({ message: 'Track borrado' });
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message }),
  });

  const generateAi = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/music/${block.id}/generate`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body;
    },
    onMutate: () => {
      notifications.show({
        id: `gen-${block.id}`,
        loading: true,
        title: 'Generando música',
        message: 'MusicGen tarda ~3-5s por cada segundo de audio. Tomate un café.',
        autoClose: false,
        withCloseButton: false,
      });
    },
    onSuccess: () => {
      notifications.hide(`gen-${block.id}`);
      onAudioChanged();
      notifications.show({ color: 'teal', message: 'Track generado' });
    },
    onError: (err) => {
      notifications.hide(`gen-${block.id}`);
      notifications.show({ color: 'red', message: err.message, autoClose: 8000 });
    },
  });

  const splitOptions: number[] = [];
  for (let i = block.startSegmentIdx + 1; i <= block.endSegmentIdx; i++) splitOptions.push(i);

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="xs">
            <Badge color={energyColor(block.energy)} variant="filled">
              {block.energy}
            </Badge>
            <Text fw={600}>{block.mood}</Text>
            <Text size="sm" c="dimmed">
              segmentos {block.startSegmentIdx + 1}–{block.endSegmentIdx + 1}
            </Text>
          </Group>
          {block.audioExt && <Badge color="teal" variant="light">{block.audioExt}</Badge>}
        </Group>

        <Stack gap={2}>
          {segmentsInBlock.map(({ idx, seg }) => {
            const hint = hintForSegment(edl, idx);
            return (
              <Text key={idx} size="xs" c="dimmed">
                · {segmentLabel(seg, idx)}
                {hint && (
                  <Text component="span" size="xs" c="dimmed" fs="italic">
                    {' '}— Claude sugería: {hint.mood} ({hint.energy})
                  </Text>
                )}
              </Text>
            );
          })}
        </Stack>

        {block.audioExt && (
          <audio
            controls
            key={audioVersion}
            src={`/api/projects/${projectId}/music/${block.id}/audio?v=${audioVersion}`}
            style={{ width: '100%' }}
          />
        )}

        <Group>
          <FileButton onChange={(f) => f && uploadAudio.mutate(f)} accept="audio/*">
            {(props) => (
              <Button variant="default" leftSection={<IconUpload size={16} />} loading={uploadAudio.isPending} {...props}>
                {block.audioExt ? 'Reemplazar track' : 'Subir track'}
              </Button>
            )}
          </FileButton>

          <Button
            variant="subtle"
            leftSection={<IconSparkles size={16} />}
            onClick={() => generateAi.mutate()}
            loading={generateAi.isPending}
          >
            Generar AI
          </Button>

          {splitOptions.length > 0 && (
            <Menu position="bottom-start" withinPortal>
              <Menu.Target>
                <Button variant="subtle" leftSection={<IconScissors size={16} />} rightSection={<IconChevronDown size={14} />}>
                  Dividir
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>Dividir antes de…</Menu.Label>
                {splitOptions.map((at) => (
                  <Menu.Item key={at} onClick={() => onSplit(at)}>
                    segmento {at + 1}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          )}

          {!isLast && (
            <Button variant="subtle" leftSection={<IconMusic size={16} />} onClick={onMerge}>
              Unir con siguiente
            </Button>
          )}

          {block.audioExt && (
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => deleteAudio.mutate()}
              loading={deleteAudio.isPending}
            >
              Borrar
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
