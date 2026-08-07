'use client';

import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import { Group, Progress, Stack, Text } from '@mantine/core';
import { IconUpload, IconVideo, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useClipUpload } from '@/hooks/useClipUpload';

const VIDEO_MIME = [MIME_TYPES.mp4, 'video/quicktime', 'video/x-matroska', 'video/webm'];

export function EditDropzone({ projectId }: { projectId: string }) {
  const { queue, isUploading, uploadFiles } = useClipUpload(projectId);
  const doneCount = queue.filter((it) => it.status === 'done' || it.status === 'error').length;

  return (
    <Stack gap={4}>
      <Dropzone
        onDrop={(files) => uploadFiles(files)}
        onReject={() => notifications.show({ color: 'red', message: 'Archivo rechazado (tipo no soportado)' })}
        loading={isUploading}
        accept={VIDEO_MIME}
        multiple
        p="sm"
      >
        <Group justify="center" gap="md" mih={56}>
          <Dropzone.Accept><IconUpload size={24} /></Dropzone.Accept>
          <Dropzone.Reject><IconX size={24} /></Dropzone.Reject>
          <Dropzone.Idle><IconVideo size={24} /></Dropzone.Idle>
          <Stack gap={0}>
            <Text size="sm">Arrastrá más clips acá o hacé click</Text>
            <Text size="xs" c="dimmed">MP4, MOV, MKV, WebM · se suben de a uno y se transcriben automáticamente</Text>
          </Stack>
        </Group>
      </Dropzone>

      {isUploading && queue.length > 0 && (
        <Stack gap={2}>
          <Text size="xs" c="dimmed">Subiendo {doneCount}/{queue.length}…</Text>
          <Progress value={(doneCount / queue.length) * 100} size="xs" />
        </Stack>
      )}
    </Stack>
  );
}
