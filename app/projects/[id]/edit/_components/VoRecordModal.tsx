'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Group, Modal, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { IconMicrophone, IconPlayerStop, IconTrash } from '@tabler/icons-react';
import { EdlVoiceover, estimateVoiceoverDurationMs } from '@/lib/edl';
import { useApiMutation } from './useApiMutation';

type RecState = 'idle' | 'recording' | 'recorded';

export function VoRecordModal({
  projectId,
  voiceover,
  opened,
  onClose,
  onChanged,
}: {
  projectId: string;
  voiceover: EdlVoiceover;
  opened: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [state, setState] = useState<RecState>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);

  const targetMs = estimateVoiceoverDurationMs(voiceover.fullScript);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [previewUrl]);

  const reset = () => {
    setBlob(null);
    setElapsedMs(0);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setState('idle');
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const out = new Blob(chunksRef.current, { type: 'audio/webm' });
        setBlob(out);
        setPreviewUrl(URL.createObjectURL(out));
        setState('recorded');
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      rec.start();
      recorderRef.current = rec;
      setState('recording');
      const startedAt = Date.now();
      tickRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`No se pudo acceder al micrófono: ${msg}`);
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    if (tickRef.current) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const upload = useApiMutation({
    mutationFn: async () => {
      if (!blob) throw new Error('Sin grabación');
      const form = new FormData();
      form.append('audio', blob, 'master.webm');
      const res = await fetch(`/api/projects/${projectId}/vo`, { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body;
    },
    invalidateKeys: [['render-props', projectId]],
    successMessage: 'VO grabado y guardado',
    onSuccessExtra: () => {
      onChanged();
      onClose();
      reset();
    },
  });

  const formatMs = (ms: number) => {
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Grabar voz en off" size="lg" closeOnClickOutside={state !== 'recording'}>
      <Stack gap="md">
        <Group gap="xs">
          <Badge variant="light">Una sola toma</Badge>
          <Text size="sm" c="dimmed">
            Estimado: {formatMs(targetMs)} · {voiceover.cues.length} cue{voiceover.cues.length === 1 ? '' : 's'}
          </Text>
        </Group>

        <Paper withBorder p="sm">
          <ScrollArea h={220}>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {voiceover.fullScript || <Text c="dimmed">El plan AI no tiene fullScript</Text>}
            </Text>
          </ScrollArea>
        </Paper>

        {error && <Alert color="red">{error}</Alert>}

        <Group justify="space-between" align="center">
          <Text size="sm" c={state === 'recording' ? 'red' : 'dimmed'}>
            {state === 'recording' && `● Grabando · ${formatMs(elapsedMs)}`}
            {state === 'recorded' && `Listo · ${formatMs(elapsedMs)}`}
            {state === 'idle' && 'Listo para grabar'}
          </Text>
          <Group gap="xs">
            {state === 'idle' && (
              <Button leftSection={<IconMicrophone size={16} />} onClick={startRecording} color="red">
                Empezar
              </Button>
            )}
            {state === 'recording' && (
              <Button leftSection={<IconPlayerStop size={16} />} onClick={stopRecording} color="red">
                Detener
              </Button>
            )}
            {state === 'recorded' && (
              <>
                <Button variant="default" leftSection={<IconTrash size={16} />} onClick={reset}>
                  Descartar
                </Button>
                <Button onClick={() => upload.mutate()} loading={upload.isPending}>
                  Guardar
                </Button>
              </>
            )}
          </Group>
        </Group>

        {previewUrl && (
          <audio src={previewUrl} controls style={{ width: '100%' }} />
        )}
      </Stack>
    </Modal>
  );
}
