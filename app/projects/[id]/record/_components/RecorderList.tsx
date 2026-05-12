'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, FileButton, Group, Stack, Text } from '@mantine/core';
import { IconMicrophone, IconPlayerStop, IconTrash, IconUpload } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { EdlVoiceoverSegment } from '@/lib/edl';

type RecState = { durationMs: number; recordedAt: string } | null;

type Status = {
  idx: number;
  segment: EdlVoiceoverSegment;
  recorded: RecState;
};

function fmtMs(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function RecorderList({ projectId, initialStatuses }: { projectId: string; initialStatuses: Status[] }) {
  const [statuses, setStatuses] = useState(initialStatuses);

  function setStatus(idx: number, recorded: RecState) {
    setStatuses((prev) => prev.map((s) => (s.idx === idx ? { ...s, recorded } : s)));
  }

  return (
    <Stack gap="md">
      {statuses.map((s) => (
        <SegmentRecorder
          key={s.idx}
          projectId={projectId}
          idx={s.idx}
          segment={s.segment}
          recorded={s.recorded}
          onChange={(rec) => setStatus(s.idx, rec)}
        />
      ))}
    </Stack>
  );
}

function SegmentRecorder({
  projectId,
  idx,
  segment,
  recorded,
  onChange,
}: {
  projectId: string;
  idx: number;
  segment: EdlVoiceoverSegment;
  recorded: RecState;
  onChange: (rec: RecState) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioVersion, setAudioVersion] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (tickRef.current) window.clearInterval(tickRef.current);
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (tickRef.current) {
          window.clearInterval(tickRef.current);
          tickRef.current = null;
        }
        setElapsedMs(0);
        await uploadBlob(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };

      mr.start();
      recorderRef.current = mr;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      tickRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
    } catch (err) {
      notifications.show({
        color: 'red',
        message: `No pude acceder al micrófono: ${err instanceof Error ? err.message : 'permiso denegado'}`,
      });
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function uploadBlob(blob: Blob) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', blob, 'recording.webm');
      const res = await fetch(`/api/projects/${projectId}/vo/${idx}`, { method: 'POST', body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      onChange({ durationMs: body.durationMs, recordedAt: body.recordedAt });
      setAudioVersion((v) => v + 1);
      notifications.show({ color: 'teal', message: 'Grabación guardada' });
    } catch (err) {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'falló' });
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File | null) {
    if (!file) return;
    await uploadBlob(file);
  }

  async function deleteRecording() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/vo/${idx}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('falló');
      onChange(null);
      notifications.show({ message: 'Grabación borrada' });
    } catch (err) {
      notifications.show({ color: 'red', message: err instanceof Error ? err.message : 'falló' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <Badge color="grape">VO #{idx + 1}</Badge>
            <Text size="sm" c="dimmed">~{fmtMs(segment.durationEstimateMs)} estimado</Text>
          </Group>
          {recorded && (
            <Badge color="teal" variant="light">
              Grabado · {fmtMs(recorded.durationMs)}
            </Badge>
          )}
        </Group>

        <Text size="md" style={{ whiteSpace: 'pre-wrap' }}>{segment.script}</Text>

        {recorded && (
          <audio
            controls
            key={audioVersion}
            src={`/api/projects/${projectId}/vo/${idx}?audio=1&v=${audioVersion}`}
            style={{ width: '100%' }}
          />
        )}

        <Group>
          {recording ? (
            <Button
              color="red"
              leftSection={<IconPlayerStop size={16} />}
              onClick={stopRecording}
            >
              Detener ({fmtMs(elapsedMs)})
            </Button>
          ) : (
            <Button
              leftSection={<IconMicrophone size={16} />}
              onClick={startRecording}
              loading={busy}
            >
              {recorded ? 'Re-grabar' : 'Grabar'}
            </Button>
          )}
          <FileButton onChange={uploadFile} accept="audio/*">
            {(props) => (
              <Button variant="default" leftSection={<IconUpload size={16} />} loading={busy} {...props}>
                Subir archivo
              </Button>
            )}
          </FileButton>
          {recorded && (
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={deleteRecording}
              loading={busy}
            >
              Borrar
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
