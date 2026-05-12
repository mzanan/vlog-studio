'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Edl, EdlSegment, EdlVoiceoverSegment, totalDurationMs } from '@/lib/edl';

type ClipMeta = { id: string; filename: string; hasVoice: boolean; durationMs: number };
type ClipsLookup = Record<string, ClipMeta>;

function fmtMs(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function PlanView({
  projectId,
  initialEdl,
  clipsLookup,
  hasClips,
}: {
  projectId: string;
  initialEdl: Edl | null;
  clipsLookup: ClipsLookup;
  hasClips: boolean;
}) {
  const [edl, setEdl] = useState<Edl | null>(initialEdl);
  const [importOpen, setImportOpen] = useState(false);
  const [rawJson, setRawJson] = useState('');

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/plan`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body.edl as Edl;
    },
    onSuccess: (newEdl) => {
      setEdl(newEdl);
      notifications.show({ color: 'teal', message: 'Plan generado' });
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message, autoClose: 8000 }),
  });

  const save = useMutation({
    mutationFn: async (next: Edl) => {
      const res = await fetch(`/api/projects/${projectId}/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edl: next }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'falló');
      return res.json();
    },
    onSuccess: () => notifications.show({ color: 'teal', message: 'Guardado' }),
    onError: (err) => notifications.show({ color: 'red', message: err.message }),
  });

  const importJson = useMutation({
    mutationFn: async (raw: string) => {
      const res = await fetch(`/api/projects/${projectId}/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawJson: raw }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body.edl as Edl;
    },
    onSuccess: (newEdl) => {
      setEdl(newEdl);
      setImportOpen(false);
      setRawJson('');
      notifications.show({ color: 'teal', message: 'EDL importado' });
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message, autoClose: 8000 }),
  });

  async function copyPrompt() {
    try {
      const res = await fetch(`/api/projects/${projectId}/plan?format=prompt`);
      if (!res.ok) throw new Error((await res.json()).error ?? 'falló');
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      notifications.show({
        color: 'teal',
        title: 'Prompt copiado',
        message: 'Pegalo en Claude Code y traé el JSON con "Pegar EDL"',
        autoClose: 6000,
      });
    } catch (err) {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'falló' });
    }
  }

  function updateScript(idx: number, script: string) {
    if (!edl) return;
    const segments = edl.segments.map((s, i) =>
      i === idx && s.kind === 'voiceover' ? { ...s, script } : s,
    );
    setEdl({ ...edl, segments });
  }

  if (!hasClips) {
    return <Text c="dimmed">Subí clips primero en la pestaña Ingest.</Text>;
  }

  return (
    <Stack gap="md">
      <Group>
        <Button onClick={() => generate.mutate()} loading={generate.isPending}>
          {edl ? 'Regenerar (Gemini)' : 'Generar plan (Gemini)'}
        </Button>
        <Button variant="default" onClick={copyPrompt}>
          Copiar prompt
        </Button>
        <Button variant="default" onClick={() => setImportOpen(true)}>
          Pegar EDL
        </Button>
        {edl && (
          <Button variant="filled" color="gray" onClick={() => save.mutate(edl)} loading={save.isPending}>
            Guardar cambios
          </Button>
        )}
      </Group>

      {edl && (
        <Text size="sm" c="dimmed">
          Duración estimada: {fmtMs(totalDurationMs(edl))} · {edl.segments.length} segmentos
        </Text>
      )}

      {!edl ? (
        <Text c="dimmed">Sin plan todavía.</Text>
      ) : (
        <Stack gap="sm">
          {edl.segments.map((seg, idx) => (
            <SegmentCard
              key={idx}
              idx={idx}
              segment={seg}
              musicHint={edl.musicHints.find((h) => h.segmentIdx === idx)}
              clipsLookup={clipsLookup}
              onScriptChange={(s) => updateScript(idx, s)}
            />
          ))}
        </Stack>
      )}

      <Modal
        opened={importOpen}
        onClose={() => setImportOpen(false)}
        title="Pegar EDL desde Claude Code"
        size="lg"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Pegá el JSON que te devolvió Claude Code (solo el objeto con segments y musicHints).
          </Text>
          <Textarea
            value={rawJson}
            onChange={(e) => setRawJson(e.currentTarget.value)}
            minRows={10}
            autosize
            placeholder='{ "segments": [...], "musicHints": [...] }'
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => importJson.mutate(rawJson)}
              loading={importJson.isPending}
              disabled={!rawJson.trim()}
            >
              Importar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

function SegmentCard({
  idx,
  segment,
  musicHint,
  clipsLookup,
  onScriptChange,
}: {
  idx: number;
  segment: EdlSegment;
  musicHint: { mood: string; energy: string } | undefined;
  clipsLookup: ClipsLookup;
  onScriptChange: (script: string) => void;
}) {
  const headerBadge =
    segment.kind === 'clip' ? (
      <Badge color="blue">{idx + 1}. clip</Badge>
    ) : (
      <Badge color="grape">{idx + 1}. voiceover</Badge>
    );

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="xs">
        <Group justify="space-between">
          <Group gap="xs">
            {headerBadge}
            {musicHint && (
              <Badge variant="light" color="gray">
                🎵 {musicHint.mood} · {musicHint.energy}
              </Badge>
            )}
          </Group>
          {segment.kind === 'clip' && (
            <Text size="xs" c="dimmed">
              {fmtMs(segment.outMs - segment.inMs)} · in {fmtMs(segment.inMs)} → out {fmtMs(segment.outMs)}
            </Text>
          )}
          {segment.kind === 'voiceover' && (
            <Text size="xs" c="dimmed">~{fmtMs(segment.durationEstimateMs)} VO</Text>
          )}
        </Group>

        {segment.kind === 'clip' ? (
          <ClipSegmentBody segment={segment} clipsLookup={clipsLookup} />
        ) : (
          <VoiceoverSegmentBody segment={segment} clipsLookup={clipsLookup} onChange={onScriptChange} />
        )}

        {segment.reason && (
          <Text size="xs" c="dimmed" fs="italic">
            {segment.reason}
          </Text>
        )}
      </Stack>
    </Card>
  );
}

function ClipSegmentBody({ segment, clipsLookup }: { segment: Extract<EdlSegment, { kind: 'clip' }>; clipsLookup: ClipsLookup }) {
  const clip = clipsLookup[segment.clipId];
  return <Text size="sm"><strong>{clip?.filename ?? segment.clipId}</strong></Text>;
}

function VoiceoverSegmentBody({
  segment,
  clipsLookup,
  onChange,
}: {
  segment: EdlVoiceoverSegment;
  clipsLookup: ClipsLookup;
  onChange: (script: string) => void;
}) {
  return (
    <Stack gap="xs">
      <Textarea
        label="Script VO"
        value={segment.script}
        onChange={(e) => onChange(e.currentTarget.value)}
        autosize
        minRows={2}
      />
      {segment.brollClipIds.length > 0 && (
        <Text size="xs" c="dimmed">
          B-roll: {segment.brollClipIds.map((id) => clipsLookup[id]?.filename ?? id).join(', ')}
        </Text>
      )}
    </Stack>
  );
}
