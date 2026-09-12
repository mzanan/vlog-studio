'use client';

import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Group, Image, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { useTranscribeRetry } from './useTranscribeRetry';

type Clip = {
  id: string;
  filename: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  hasVoice: boolean;
  wordsPerSec: number | null;
  thumbnailPath: string | null;
  transcribedAt: string | Date | null;
  transcribeError: string | null;
};

function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function ClipGrid({ projectId, initialClips }: { projectId: string; initialClips: Clip[] }) {
  const { retryClip, retryAllFailed } = useTranscribeRetry(projectId);
  const { data } = useQuery({
    queryKey: ['clips', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/clips`);
      const json = await res.json();
      return json.clips as Clip[];
    },
    initialData: initialClips,
    refetchInterval: 5000,
  });

  if (!data || data.length === 0) {
    return <Text c="dimmed">No clips yet. Upload some above.</Text>;
  }

  const failed = data.filter((clip) => clip.transcribeError);

  return (
    <Stack gap="md">
      {failed.length > 0 && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title={`${failed.length} clip(s) failed to transcribe`}>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text size="sm">{failed[0].transcribeError}</Text>
            <Button
              size="xs"
              variant="light"
              color="red"
              leftSection={<IconRefresh size={14} />}
              loading={retryAllFailed.isPending}
              onClick={() => retryAllFailed.mutate()}
            >
              Retry all
            </Button>
          </Group>
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
        {data.map((clip) => (
          <Card key={clip.id} withBorder padding="sm" radius="md">
            <Card.Section>
              {clip.thumbnailPath ? (
                <Image
                  src={`/api/projects/${projectId}/clips/${clip.id}/thumb`}
                  alt={clip.filename}
                  height={140}
                  fit="cover"
                />
              ) : (
                <div style={{ height: 140, background: 'var(--mantine-color-dark-6)' }} />
              )}
            </Card.Section>
            <Stack gap={4} mt="sm">
              <Text size="sm" fw={500} lineClamp={1}>{clip.filename}</Text>
              <Group gap={6}>
                <Badge variant="light" size="sm">{fmtDuration(clip.durationMs)}</Badge>
                <Badge variant="light" size="sm">{clip.width}×{clip.height}</Badge>
                <Badge variant="light" size="sm">{clip.fps.toFixed(0)}fps</Badge>
                {clip.transcribedAt ? (
                  <Badge color={clip.hasVoice ? 'teal' : 'gray'} size="sm">
                    {clip.hasVoice ? `on-camera · ${clip.wordsPerSec?.toFixed(1) ?? '?'} wps` : 'B-roll'}
                  </Badge>
                ) : clip.transcribeError ? (
                  <Badge color="red" size="sm">transcription failed</Badge>
                ) : (
                  <Badge color="yellow" size="sm">transcribing…</Badge>
                )}
              </Group>
              {clip.transcribeError && (
                <Stack gap={4}>
                  <Text size="xs" c="red" lineClamp={3}>{clip.transcribeError}</Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    leftSection={<IconRefresh size={12} />}
                    loading={retryClip.isPending && retryClip.variables === clip.id}
                    onClick={() => retryClip.mutate(clip.id)}
                  >
                    Retry
                  </Button>
                </Stack>
              )}
            </Stack>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
