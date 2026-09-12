'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Anchor, Badge, Button, Card, Group, Loader, SegmentedControl, Stack, Switch, Text } from '@mantine/core';
import { IconDownload, IconVideo } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { showExportResultNotification } from '@/lib/export-notifications';
import { DEFAULT_VIDEO_FORMAT, VideoFormat } from '@/lib/format';

type ExportFile = { filename: string; sizeBytes: number; modifiedAt: string };

function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ExportView({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [format, setFormat] = useState<VideoFormat>(DEFAULT_VIDEO_FORMAT);
  const [withCaptions, setWithCaptions] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['exports', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/export`);
      if (!res.ok) throw new Error('failed');
      return (await res.json()) as { exports: ExportFile[] };
    },
  });

  const render = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ format, captions: withCaptions }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'failed');
      return body as { filename: string; durationFrames: number; warnings: string[] };
    },
    onMutate: () => {
      notifications.show({
        id: `render-${projectId}`,
        loading: true,
        title: 'Rendering',
        message: 'Bundle + render. Takes several minutes. Do not close the dev server.',
        autoClose: false,
        withCloseButton: false,
      });
    },
    onSuccess: (body) => {
      notifications.hide(`render-${projectId}`);
      qc.invalidateQueries({ queryKey: ['exports', projectId] });
      showExportResultNotification(body);
    },
    onError: (err) => {
      notifications.hide(`render-${projectId}`);
      notifications.show({ color: 'red', message: err.message, autoClose: 10000 });
    },
  });

  return (
    <Stack gap="md">
      <Group>
        <Button leftSection={<IconVideo size={16} />} onClick={() => render.mutate()} loading={render.isPending}>
          {format === 'vertical' ? 'Render short' : 'Render vlog'}
        </Button>
        <SegmentedControl
          size="sm"
          value={format}
          onChange={(v) => setFormat(v as VideoFormat)}
          data={[
            { label: '16:9', value: 'landscape' },
            { label: '9:16', value: 'vertical' },
          ]}
          title="9:16 center-crops every clip to vertical for TikTok, Reels and Shorts."
        />
        <Switch
          size="sm"
          checked={withCaptions}
          onChange={(e) => setWithCaptions(e.currentTarget.checked)}
          label="Burn captions"
        />
      </Group>
      {withCaptions && (
        <Text size="xs" c="dimmed">
          Captions come from the transcribed words of to-camera clips. B-roll and voiceover have no transcript, so they stay uncaptioned.
        </Text>
      )}

      {isLoading ? (
        <Loader />
      ) : !data || data.exports.length === 0 ? (
        <Text c="dimmed">No renders yet.</Text>
      ) : (
        <Stack gap="sm">
          {data.exports.map((file) => (
            <Card key={file.filename} withBorder padding="sm" radius="md">
              <Group justify="space-between">
                <Stack gap={2}>
                  <Text size="sm" fw={500}>{file.filename}</Text>
                  <Group gap="xs">
                    <Badge variant="light" size="sm">{fmtSize(file.sizeBytes)}</Badge>
                    <Text size="xs" c="dimmed">{new Date(file.modifiedAt).toLocaleString()}</Text>
                  </Group>
                </Stack>
                <Anchor href={`/api/projects/${projectId}/export/${file.filename}`} download>
                  <Button variant="default" size="xs" leftSection={<IconDownload size={14} />}>
                    Download
                  </Button>
                </Anchor>
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
