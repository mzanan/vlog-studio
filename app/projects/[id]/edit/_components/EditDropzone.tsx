'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import { Group, Stack, Text } from '@mantine/core';
import { IconUpload, IconVideo, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

const VIDEO_MIME = [MIME_TYPES.mp4, 'video/quicktime', 'video/x-matroska', 'video/webm'];

export function EditDropzone({ projectId }: { projectId: string }) {
  const router = useRouter();

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const form = new FormData();
      for (const f of files) form.append('files', f);
      const res = await fetch(`/api/projects/${projectId}/clips`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      router.refresh();
      notifications.show({ color: 'teal', message: 'Clips subidos — transcripción en curso' });
    },
    onError: (err) => notifications.show({ color: 'red', message: `Falló: ${err.message}`, autoClose: 8000 }),
  });

  return (
    <Dropzone
      onDrop={(files) => upload.mutate(files)}
      onReject={() => notifications.show({ color: 'red', message: 'Archivo rechazado (tipo no soportado)' })}
      loading={upload.isPending}
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
          <Text size="xs" c="dimmed">MP4, MOV, MKV, WebM · se transcriben automáticamente</Text>
        </Stack>
      </Group>
    </Dropzone>
  );
}
