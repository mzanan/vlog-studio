'use client';

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Button, Group, Loader, Stack, Text } from '@mantine/core';
import { IconSparkles, IconVideo } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { Edl } from '@/lib/edl';
import { MusicBlock } from '@/lib/music';
import { VlogInputProps } from '@/lib/remotion/types';
import { EditorPlayer } from './EditorPlayer';
import { Timeline } from './Timeline';

export type ClipMeta = {
  id: string;
  filename: string;
  durationMs: number;
  hasVoice: boolean;
  transcribedAt: string | null;
};

export function Editor({
  projectId,
  projectName,
  clips,
}: {
  projectId: string;
  projectName: string;
  clips: ClipMeta[];
}) {
  const qc = useQueryClient();

  const planQuery = useQuery({
    queryKey: ['edl', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/plan`);
      if (!res.ok) return null;
      const body = await res.json();
      return body.edl as Edl | null;
    },
  });

  const musicQuery = useQuery({
    queryKey: ['music', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/music`);
      if (!res.ok) throw new Error('falló');
      return (await res.json()).blocks as MusicBlock[];
    },
  });

  const renderPropsQuery = useQuery({
    queryKey: ['render-props', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/render-props`);
      if (!res.ok) return null;
      return (await res.json()).props as VlogInputProps;
    },
    enabled: clips.length > 0,
  });

  const generatePlan = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/plan`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body.edl as Edl;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['edl', projectId] });
      qc.invalidateQueries({ queryKey: ['music', projectId] });
      qc.invalidateQueries({ queryKey: ['render-props', projectId] });
      notifications.show({ color: 'teal', message: 'Plan generado' });
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message, autoClose: 8000 }),
  });

  const startExport = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/export`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body as { filename: string };
    },
    onMutate: () => {
      notifications.show({
        id: `render-${projectId}`,
        loading: true,
        title: 'Renderizando vlog',
        message: 'Toma varios minutos. No cierres el dev server.',
        autoClose: false,
        withCloseButton: false,
      });
    },
    onSuccess: (body) => {
      notifications.hide(`render-${projectId}`);
      notifications.show({
        color: 'teal',
        title: 'Render listo',
        message: body.filename,
        autoClose: 6000,
      });
    },
    onError: (err) => {
      notifications.hide(`render-${projectId}`);
      notifications.show({ color: 'red', message: err.message, autoClose: 10000 });
    },
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['edl', projectId] });
    qc.invalidateQueries({ queryKey: ['music', projectId] });
    qc.invalidateQueries({ queryKey: ['render-props', projectId] });
  };

  if (clips.length === 0) {
    return (
      <Stack>
        <Text c="dimmed">No hay clips todavía. Subí algunos en la pestaña Ingest.</Text>
        <Group>
          <Button component="a" href={`/projects/${projectId}/ingest`}>Ir a Ingest</Button>
        </Group>
      </Stack>
    );
  }

  const untranscribed = clips.filter((c) => !c.transcribedAt).length;

  return (
    <Stack gap="md">
      <Group>
        <Button
          leftSection={<IconSparkles size={16} />}
          onClick={() => generatePlan.mutate()}
          loading={generatePlan.isPending}
          disabled={untranscribed > 0}
          title={untranscribed > 0 ? `${untranscribed} clips sin transcribir` : undefined}
        >
          {planQuery.data ? 'Regenerar plan AI' : 'Generar plan AI'}
        </Button>
        <Button
          variant="filled"
          color="gray"
          leftSection={<IconVideo size={16} />}
          onClick={() => startExport.mutate()}
          loading={startExport.isPending}
          disabled={!planQuery.data}
        >
          Renderizar 16:9
        </Button>
        <Button variant="default" component="a" href={`/projects/${projectId}/ingest`}>
          Clips ({clips.length})
        </Button>
        {untranscribed > 0 && (
          <Text size="sm" c="yellow">{untranscribed} sin transcribir</Text>
        )}
      </Group>

      {planQuery.isLoading ? (
        <Loader />
      ) : !planQuery.data ? (
        <Text c="dimmed">
          No hay plan todavía. Clickeá &quot;Generar plan AI&quot; arriba para que Gemini te proponga un EDL inicial.
        </Text>
      ) : (
        <>
          <EditorPlayer
            props={renderPropsQuery.data ?? null}
            loading={renderPropsQuery.isLoading || renderPropsQuery.isFetching}
          />
          <Timeline
            projectId={projectId}
            edl={planQuery.data}
            musicBlocks={musicQuery.data ?? []}
            clips={clips}
            onChanged={refreshAll}
          />
        </>
      )}
    </Stack>
  );
}
