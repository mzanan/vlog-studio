'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Anchor,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  SegmentedControl,
  Slider,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlayerPlay, IconPlayerStop, IconSearch } from '@tabler/icons-react';
import type { JamendoTrack } from '@/lib/music-search';
import { useApiMutation } from './useApiMutation';
import { requirePlanVersion, syncPlanCache } from '@/lib/plan-version';

export type SectionMeta = {
  id: string;
  query: string;
  mood: string;
  energy: string;
  durationMs: number;
  trackId?: string;
  baseVolume: number;
};

export type NewSectionMeta = {
  startMs: number;
  endMs: number;
};

type Energy = 'low' | 'mid' | 'high';

const SEARCH_LIMIT = 10;

export function MusicPickerModal({
  projectId,
  section,
  newSection,
  opened,
  onClose,
  onChanged,
}: {
  projectId: string;
  section: SectionMeta | null;
  newSection?: NewSectionMeta | null;
  opened: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const mode: 'edit' | 'new' | 'none' = section ? 'edit' : newSection ? 'new' : 'none';

  // Estado inicializado desde section/newSection. El caller (Timeline.tsx) le
  // pasa un `key` que cambia en cada apertura, remontando el componente en
  // vez de resetear el estado en un effect.
  const [selected, setSelected] = useState<JamendoTrack | null>(null);
  const [baseVolume, setBaseVolume] = useState(section?.baseVolume ?? 0.15);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [query, setQuery] = useState(section?.query ?? '');
  const [appliedQuery, setAppliedQuery] = useState(section?.query ?? '');
  const [mood, setMood] = useState(section?.mood ?? '');
  const [energy, setEnergy] = useState<Energy>((section?.energy as Energy) ?? 'mid');

  const durationMs = section?.durationMs ?? (newSection ? newSection.endMs - newSection.startMs : 0);
  const qc = useQueryClient();

  const search = useQuery({
    queryKey: ['music-search', appliedQuery, durationMs, SEARCH_LIMIT],
    queryFn: async () => {
      if (!appliedQuery.trim() || !durationMs) return [];
      const params = new URLSearchParams({
        query: appliedQuery.trim(),
        durationMs: String(durationMs),
        limit: String(SEARCH_LIMIT),
      });
      const res = await fetch(`/api/projects/${projectId}/music-search?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló búsqueda');
      return body.tracks as JamendoTrack[];
    },
    enabled: opened && !!appliedQuery.trim() && durationMs > 0,
  });

  const apply = useApiMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('elegí un track');
      const expectedPlanVersion = requirePlanVersion(qc, projectId);
      if (mode === 'edit' && section) {
        const res = await fetch(`/api/projects/${projectId}/plan/music/${section.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ track: selected, baseVolume, expectedPlanVersion }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? 'falló');
        return body;
      }
      if (mode === 'new' && newSection) {
        const res = await fetch(`/api/projects/${projectId}/plan/music`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startMs: newSection.startMs,
            endMs: newSection.endMs,
            query: query.trim() || appliedQuery.trim() || mood || 'music',
            mood: mood.trim() || appliedQuery.trim() || 'música',
            energy,
            baseVolume,
            track: selected,
            expectedPlanVersion,
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? 'falló');
        return body;
      }
      throw new Error('estado inválido del modal');
    },
    invalidateKeys: [['render-props', projectId]],
    errorInvalidateKeys: [['edl', projectId]],
    onSuccessCache: (result) => syncPlanCache(qc, projectId, result),
    successMessage: mode === 'new' ? 'Música insertada' : 'Música aplicada',
    onSuccessExtra: () => {
      onChanged();
      onClose();
    },
  });

  const handleSearch = () => {
    setAppliedQuery(query);
  };

  if (mode === 'none') return null;

  const headerTitle = mode === 'new' ? 'Insertar música nueva' : 'Elegir música';

  return (
    <Modal opened={opened} onClose={onClose} title={headerTitle} size="lg">
      <Stack gap="md">
        {mode === 'new' && newSection && (
          <Group gap="xs">
            <Badge variant="light" color="teal">
              {(newSection.startMs / 1000).toFixed(1)}s → {(newSection.endMs / 1000).toFixed(1)}s
            </Badge>
            <Text size="xs" c="dimmed">
              ({Math.round((newSection.endMs - newSection.startMs) / 1000)}s de música)
            </Text>
          </Group>
        )}

        {mode === 'new' && (
          <Group grow>
            <TextInput
              label="Mood"
              placeholder="ej: contemplativo, energético, melancólico"
              value={mood}
              onChange={(e) => setMood(e.currentTarget.value)}
            />
            <Stack gap={2}>
              <Text size="sm" fw={500}>Energía</Text>
              <SegmentedControl
                value={energy}
                onChange={(v) => setEnergy(v as Energy)}
                data={[
                  { label: 'Low', value: 'low' },
                  { label: 'Mid', value: 'mid' },
                  { label: 'High', value: 'high' },
                ]}
              />
            </Stack>
          </Group>
        )}

        {mode === 'edit' && section && (
          <Group gap="xs">
            <Badge variant="light">{section.mood}</Badge>
            <Badge variant="light" color="grape">{section.energy}</Badge>
          </Group>
        )}

        <Group gap="xs" align="flex-end">
          <TextInput
            label="Buscar en Jamendo (tags en inglés)"
            placeholder="ej: calm acoustic travel"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
            }}
            style={{ flex: 1 }}
          />
          <Button
            leftSection={<IconSearch size={14} />}
            onClick={handleSearch}
            disabled={!query.trim()}
          >
            Buscar
          </Button>
        </Group>

        {search.isLoading && <Loader size="sm" />}
        {search.isError && (
          <Text c="red" size="sm">{(search.error as Error).message}</Text>
        )}
        {appliedQuery && search.data && search.data.length === 0 && !search.isLoading && (
          <Text c="dimmed" size="sm">Sin resultados para &quot;{appliedQuery}&quot;. Probá con otros tags.</Text>
        )}
        {!appliedQuery && (
          <Text c="dimmed" size="sm">Escribí tags y apretá Buscar para ver alternativas.</Text>
        )}

        <Stack gap="xs">
          {search.data?.map((t) => {
            const isSelected = selected?.trackId === t.trackId;
            const isPlaying = playingId === t.trackId;
            return (
              <Paper
                key={t.trackId}
                withBorder
                p="sm"
                style={{
                  cursor: 'pointer',
                  borderColor: isSelected ? 'var(--mantine-color-teal-6)' : undefined,
                  borderWidth: isSelected ? 2 : 1,
                }}
                onClick={() => setSelected(t)}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>{t.title}</Text>
                    <Text size="xs" c="dimmed" truncate>
                      {t.artist} · {Math.round(t.durationSec)}s · <Anchor size="xs" href={t.licenseUrl} target="_blank" onClick={(e) => e.stopPropagation()}>licencia</Anchor>
                    </Text>
                  </Stack>
                  <Button
                    variant="subtle"
                    size="xs"
                    leftSection={isPlaying ? <IconPlayerStop size={14} /> : <IconPlayerPlay size={14} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlayingId(isPlaying ? null : t.trackId);
                    }}
                  >
                    {isPlaying ? 'Stop' : 'Preview'}
                  </Button>
                </Group>
                {isPlaying && (
                  <audio
                    src={t.audioDownloadUrl || t.audioUrl}
                    autoPlay
                    controls
                    style={{ width: '100%', marginTop: 8 }}
                    onEnded={() => setPlayingId(null)}
                  />
                )}
              </Paper>
            );
          })}
        </Stack>

        <Stack gap="xs">
          <Text size="sm">Volumen base: {(baseVolume * 100).toFixed(0)}%</Text>
          <Slider value={baseVolume} onChange={setBaseVolume} min={0} max={0.6} step={0.01} />
          <Text size="xs" c="dimmed">
            El render hace ducking automático sobre VO/diálogo; este es el volumen cuando no hay voz.
          </Text>
        </Stack>

        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => apply.mutate()} loading={apply.isPending} disabled={!selected}>
            {mode === 'new' ? 'Insertar' : 'Aplicar'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
