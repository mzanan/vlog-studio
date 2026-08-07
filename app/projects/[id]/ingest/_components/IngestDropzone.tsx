'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import { Button, Group, Progress, Stack, Text } from '@mantine/core';
import { IconFileImport, IconUpload, IconVideo, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useClipUpload } from '@/hooks/useClipUpload';

const VIDEO_MIME = [
  MIME_TYPES.mp4,
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
];

export function IngestDropzone({ projectId }: { projectId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const openRef = useRef<() => void>(() => undefined);
  const { queue, isUploading, uploadFiles } = useClipUpload(projectId);
  const doneCount = queue.filter((it) => it.status === 'done' || it.status === 'error').length;

  const importInbox = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/clips/import-inbox`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body as { imported: number; failed: { file: string; error: string }[] };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['clips', projectId] });
      router.refresh();
      if (data.imported === 0) {
        notifications.show({ color: 'yellow', message: 'No había clips nuevos en data/inbox/' });
      } else {
        notifications.show({
          color: 'teal',
          message: `${data.imported} clips importados${data.failed.length ? ` (${data.failed.length} fallaron)` : ''}`,
        });
      }
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message, autoClose: 8000 }),
  });

  return (
    <Stack gap="sm">
      <Dropzone
        openRef={openRef}
        onDrop={(files) => uploadFiles(files)}
        onReject={() => notifications.show({ color: 'red', message: 'Archivo rechazado (tipo no soportado)' })}
        loading={isUploading}
        accept={VIDEO_MIME}
        multiple
      >
        <Group justify="center" gap="xl" mih={160}>
          <Dropzone.Accept><IconUpload size={48} /></Dropzone.Accept>
          <Dropzone.Reject><IconX size={48} /></Dropzone.Reject>
          <Dropzone.Idle><IconVideo size={48} /></Dropzone.Idle>
          <Stack gap={4}>
            <Text size="lg">Arrastrá clips acá o hacé click</Text>
            <Text size="sm" c="dimmed">MP4, MOV, MKV, WebM · se suben de a uno</Text>
          </Stack>
        </Group>
      </Dropzone>

      {isUploading && queue.length > 0 && (
        <Stack gap={4}>
          <Text size="sm" c="dimmed">Subiendo {doneCount}/{queue.length}…</Text>
          <Progress value={(doneCount / queue.length) * 100} size="sm" />
        </Stack>
      )}

      <Group justify="flex-end">
        <Button
          variant="default"
          leftSection={<IconFileImport size={16} />}
          onClick={() => importInbox.mutate()}
          loading={importInbox.isPending}
        >
          Importar inbox (data/inbox/)
        </Button>
      </Group>
    </Stack>
  );
}
