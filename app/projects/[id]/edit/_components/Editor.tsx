'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Button, Group, Indicator, Loader, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconSparkles, IconVideo, IconMicrophone, IconWand, IconWaveSine } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { PlayerRef } from '@remotion/player';
import { Edl } from '@/lib/edl';
import { Suggestion } from '@/lib/suggestions';
import { CutPreset } from '@/lib/llm';
import { VlogInputProps } from '@/lib/remotion/types';
import { useLocalStorageValue, setLocalStorageValue } from '@/hooks/useLocalStorageValue';
import { EditorPlayer } from './EditorPlayer';
import { Timeline } from './Timeline';
import { useApiMutation } from './useApiMutation';
import { EditDropzone } from './EditDropzone';
import { VoRecordModal } from './VoRecordModal';
import { SuggestionsPanel } from './SuggestionsPanel';
import { SuggestionChatModal } from './SuggestionChatModal';

function parseCutPreset(raw: string | null): CutPreset {
  return raw === 'conservative' || raw === 'balanced' || raw === 'aggressive' ? raw : 'balanced';
}

export type ClipMeta = {
  id: string;
  filename: string;
  durationMs: number;
  hasVoice: boolean;
  transcribedAt: string | null;
};

type PlanResponse = {
  edl: Edl | null;
  suggestions: Suggestion[];
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
  const [voModalOpen, setVoModalOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [chatSuggestionId, setChatSuggestionId] = useState<string | null>(null);
  const playerRef = useRef<PlayerRef | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const fpsRef = useRef(30);

  // Atajos de teclado (ignora si el foco está en input/textarea/contentEditable):
  // - Space: toggle play/pause
  // - ←/→: -5s / +5s
  // - shift+←/→: -10s / +10s
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      if (!playerRef.current) return;

      if (e.code === 'Space') {
        e.preventDefault();
        playerRef.current.toggle();
        return;
      }

      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const deltaSec = e.shiftKey ? 10 : 5;
        const dir = e.code === 'ArrowRight' ? 1 : -1;
        const deltaFrames = Math.round(deltaSec * fpsRef.current) * dir;
        const current = playerRef.current.getCurrentFrame();
        e.preventDefault();
        playerRef.current.seekTo(Math.max(0, current + deltaFrames));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Cut preset: persiste por proyecto en localStorage (no requiere DB).
  const cutPresetKey = `vlog-studio:cutPreset:${projectId}`;
  const cutPreset = useLocalStorageValue(cutPresetKey, parseCutPreset);
  const updateCutPreset = (next: CutPreset) => setLocalStorageValue(cutPresetKey, next);

  const planQuery = useQuery({
    queryKey: ['edl', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/plan`);
      if (!res.ok) return { edl: null, suggestions: [], isDefault: false } as PlanResponse;
      return (await res.json()) as PlanResponse;
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

  // Mantener fpsRef sincronizado con el fps real (lo lee el handler de teclado).
  useEffect(() => {
    if (renderPropsQuery.data?.fps) fpsRef.current = renderPropsQuery.data.fps;
  }, [renderPropsQuery.data?.fps]);

  const generatePlan = useApiMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cutPreset }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body as { suggestions: Suggestion[]; generated: number };
    },
    invalidateKeys: [['edl', projectId], ['render-props', projectId]],
    successMessage: 'Sugerencias AI generadas — revisalas en la timeline o en el panel',
    onSuccessExtra: () => setPanelOpen(true),
  });

  const normalizeAudio = useApiMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/normalize-audio`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body as { normalized: number; failed: number };
    },
    invalidateKeys: [['render-props', projectId]],
    successMessage: 'Audio normalizado en todos los clips',
    errorAutoClose: 10000,
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
  const edl = planQuery.data?.edl ?? null;
  const suggestions = planQuery.data?.suggestions ?? [];
  const pendingCount = suggestions.filter((s) => s.status === 'pending').length;
  const hasAnySuggestion = suggestions.length > 0;

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
          {hasAnySuggestion ? 'Regenerar sugerencias AI' : 'Generar sugerencias AI'}
        </Button>
        <SegmentedControl
          size="sm"
          value={cutPreset}
          onChange={(v) => updateCutPreset(v as CutPreset)}
          data={[
            { label: 'Conservador', value: 'conservative' },
            { label: 'Balanceado', value: 'balanced' },
            { label: 'Agresivo', value: 'aggressive' },
          ]}
          title="Conservador: sólo bordes. Balanceado: limpieza ordinaria. Agresivo: cortes densos para vlog rápido."
        />
        <Indicator
          inline
          label={pendingCount}
          size={16}
          color="teal"
          disabled={pendingCount === 0}
        >
          <Button
            variant="default"
            leftSection={<IconWand size={16} />}
            onClick={() => setPanelOpen(true)}
            disabled={!hasAnySuggestion}
          >
            Sugerencias
          </Button>
        </Indicator>
        <Button
          variant="filled"
          color="gray"
          leftSection={<IconVideo size={16} />}
          onClick={() => startExport.mutate()}
          loading={startExport.isPending}
          disabled={!edl}
        >
          Renderizar 16:9
        </Button>
        <Button
          variant="default"
          leftSection={<IconMicrophone size={16} />}
          onClick={() => setVoModalOpen(true)}
          disabled={!edl?.voiceover.fullScript}
          title={!edl?.voiceover.fullScript ? 'Aceptá la sugerencia de VO o escribí el script manualmente' : undefined}
        >
          Grabar VO
        </Button>
        <Button
          variant="default"
          leftSection={<IconWaveSine size={16} />}
          onClick={() => normalizeAudio.mutate()}
          loading={normalizeAudio.isPending}
          title="Mide loudness de cada clip y aplica gain en el render para que todos suenen parejos (-16 LUFS)"
        >
          Normalizar audio
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
      ) : !edl ? (
        <Text c="dimmed">
          No hay clips todavía. Subí algunos desde el botón &quot;Clips&quot; arriba.
        </Text>
      ) : (
        <>
          <EditDropzone projectId={projectId} />
          <EditorPlayer
            props={renderPropsQuery.data ?? null}
            loading={renderPropsQuery.isLoading || renderPropsQuery.isFetching}
            playerRef={playerRef}
            onFrameUpdate={setCurrentFrame}
          />
          <Timeline
            projectId={projectId}
            edl={edl}
            suggestions={suggestions}
            clips={clips}
            onChanged={refreshAll}
            playerRef={playerRef}
            currentFrame={currentFrame}
            fps={renderPropsQuery.data?.fps ?? 30}
            onChatSuggestion={setChatSuggestionId}
          />
        </>
      )}

      {edl && (
        <VoRecordModal
          projectId={projectId}
          voiceover={edl.voiceover}
          opened={voModalOpen}
          onClose={() => setVoModalOpen(false)}
          onChanged={refreshAll}
        />
      )}

      <SuggestionsPanel
        projectId={projectId}
        suggestions={suggestions}
        opened={panelOpen}
        onClose={() => setPanelOpen(false)}
        onChanged={refreshAll}
        onChatSuggestion={setChatSuggestionId}
      />

      <SuggestionChatModal
        projectId={projectId}
        suggestion={chatSuggestionId ? suggestions.find((s) => s.id === chatSuggestionId) ?? null : null}
        opened={chatSuggestionId !== null}
        onClose={() => setChatSuggestionId(null)}
        onChanged={refreshAll}
      />
    </Stack>
  );
}
