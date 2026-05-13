'use client';

import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Button, Group, Loader, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconSparkles, IconVideo, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { Edl, EdlSource } from '@/lib/edl';
import { VlogInputProps } from '@/lib/remotion/types';
import { EditorPlayer } from './EditorPlayer';
import { Timeline } from './Timeline';
import { useApiMutation } from './useApiMutation';

export type ClipMeta = {
  id: string;
  filename: string;
  durationMs: number;
  hasVoice: boolean;
  transcribedAt: string | null;
};

type PlanResponse = {
  edl: Edl | null;
  suggestion: Edl | null;
  isDefault: boolean;
};

export function Editor({
  projectId,
  clips,
}: {
  projectId: string;
  projectName: string;
  clips: ClipMeta[];
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<EdlSource>('user');

  const planQuery = useQuery({
    queryKey: ['edl', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/plan`);
      if (!res.ok) return { edl: null, suggestion: null, isDefault: false } as PlanResponse;
      return (await res.json()) as PlanResponse;
    },
  });

  const hasSuggestion = !!planQuery.data?.suggestion;
  const showSuggestion = view === 'suggestion' && hasSuggestion;

  const renderPropsQuery = useQuery({
    queryKey: ['render-props', projectId, showSuggestion ? 'suggestion' : 'user'],
    queryFn: async () => {
      const url = `/api/projects/${projectId}/render-props${showSuggestion ? '?source=suggestion' : ''}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return (await res.json()).props as VlogInputProps;
    },
    enabled: clips.length > 0,
  });

  const generatePlan = useApiMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/plan`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body.suggestion as Edl;
    },
    invalidateKeys: [['edl', projectId], ['render-props', projectId]],
    successMessage: 'Sugerencia AI generada — revisala y aplicá si te gusta',
    onSuccessExtra: () => setView('suggestion'),
  });

  const applySuggestion = useApiMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/plan/apply`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body.edl as Edl;
    },
    invalidateKeys: [['edl', projectId], ['render-props', projectId]],
    successMessage: 'Sugerencia aplicada a tu timeline',
    onSuccessExtra: () => setView('user'),
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
  const userEdl = planQuery.data?.edl ?? null;
  const suggestionEdl = planQuery.data?.suggestion ?? null;
  const isDefault = planQuery.data?.isDefault ?? false;
  const hasUserPlan = !!userEdl && !isDefault;
  const displayedEdl = showSuggestion ? suggestionEdl : userEdl;

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
          {hasSuggestion ? 'Regenerar sugerencia AI' : 'Generar sugerencia AI'}
        </Button>
        <Button
          variant="filled"
          color="gray"
          leftSection={<IconVideo size={16} />}
          onClick={() => startExport.mutate()}
          loading={startExport.isPending}
          disabled={!userEdl || showSuggestion}
          title={showSuggestion ? 'Aplicá la sugerencia antes de renderizar' : undefined}
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

      {hasSuggestion && (
        <Group gap="sm">
          <SegmentedControl
            value={showSuggestion ? 'suggestion' : 'user'}
            onChange={(v) => setView(v as EdlSource)}
            data={[
              { label: hasUserPlan ? 'Mi timeline' : 'Mis clips', value: 'user' },
              { label: 'Sugerencia AI', value: 'suggestion' },
            ]}
          />
          {showSuggestion && (
            <Button
              leftSection={<IconCheck size={16} />}
              color="teal"
              onClick={() => applySuggestion.mutate()}
              loading={applySuggestion.isPending}
            >
              Aplicar sugerencia
            </Button>
          )}
        </Group>
      )}

      {planQuery.isLoading ? (
        <Loader />
      ) : !displayedEdl ? (
        <Text c="dimmed">
          No hay clips todavía. Subí algunos desde el botón &quot;Clips&quot; arriba.
        </Text>
      ) : (
        <>
          {!showSuggestion && isDefault && (
            <Text c="dimmed" size="sm">
              Mostrando clips originales en orden de creación. Generá sugerencia AI para cortes y orden propuestos.
            </Text>
          )}
          {showSuggestion && (
            <Text c="dimmed" size="sm">
              Vista de solo lectura. Aplicá la sugerencia para poder editarla.
            </Text>
          )}
          <EditorPlayer
            props={renderPropsQuery.data ?? null}
            loading={renderPropsQuery.isLoading || renderPropsQuery.isFetching}
          />
          <Timeline
            projectId={projectId}
            edl={displayedEdl}
            clips={clips}
            onChanged={refreshAll}
            readOnly={showSuggestion}
          />
        </>
      )}
    </Stack>
  );
}
