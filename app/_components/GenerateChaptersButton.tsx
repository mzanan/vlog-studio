'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Anchor, Button, Group, List, ListItem, Progress, Stack, Text } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

type ChapterSummary = { title: string; reason: string; clipCount: number };
type SavedGrouping = { generatedAt: string; chapters: ChapterSummary[] };

type ChapterImportProgress = {
  status: 'running' | 'done' | 'error';
  error: string | null;
  totalClips: number;
  doneClips: number;
  chapters: {
    title: string;
    reason: string;
    projectId: string | null;
    status: 'pending' | 'importing' | 'done';
    totalClips: number;
    imported: number;
    failed: { clip: string; error: string }[];
  }[];
};

export function GenerateChaptersButton({
  initialGrouping,
  initialImportProgress,
}: {
  initialGrouping: SavedGrouping | null;
  initialImportProgress: ChapterImportProgress | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/chapters/generate', { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<SavedGrouping>;
    },
    onSuccess: () => router.refresh(),
    onError: () => notifications.show({ color: 'red', message: 'Chapter grouping failed' }),
  });

  const importQuery = useQuery({
    queryKey: ['chapter-import'],
    queryFn: async () => {
      const res = await fetch('/api/chapters/import');
      if (res.status === 404) return null;
      return res.json() as Promise<ChapterImportProgress>;
    },
    initialData: initialImportProgress,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 3000 : false),
  });

  const startImportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/chapters/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxChapters: 2 }),
      });
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<ChapterImportProgress>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['chapter-import'], data);
      router.refresh();
    },
    onError: () => notifications.show({ color: 'red', message: 'Chapter import failed' }),
  });

  const grouping = generateMutation.data ?? initialGrouping;
  const progress = importQuery.data;
  const importRunning = progress?.status === 'running';

  const lastStatus = useRef(progress?.status);
  useEffect(() => {
    if (lastStatus.current === 'running' && progress?.status !== 'running') router.refresh();
    lastStatus.current = progress?.status;
  }, [progress?.status, router]);

  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Button
          variant={grouping ? 'subtle' : 'light'}
          onClick={() => generateMutation.mutate()}
          loading={generateMutation.isPending}
        >
          {grouping ? 'Regenerate chapter grouping' : 'Group Tokyo clips into chapters'}
        </Button>
        {grouping && (
          <Button
            onClick={() => startImportMutation.mutate()}
            loading={startImportMutation.isPending}
            disabled={importRunning}
          >
            Import chapters (test: first 2)
          </Button>
        )}
      </Group>

      {generateMutation.isPending && <Text size="sm" c="dimmed">Grouping clips with the LLM...</Text>}

      {progress && (
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            {progress.status === 'running' && `Importing... ${progress.doneClips}/${progress.totalClips} clips`}
            {progress.status === 'done' && `Import finished: ${progress.doneClips}/${progress.totalClips} clips`}
            {progress.status === 'error' && `Import failed: ${progress.error}`}
          </Text>
          {progress.status === 'running' && (
            <Progress value={(progress.doneClips / progress.totalClips) * 100} size="sm" />
          )}
          <List size="sm" spacing="xs">
            {progress.chapters.map((c) => (
              <ListItem key={c.title}>
                {c.projectId ? <Anchor href={`/projects/${c.projectId}/edit`}>{c.title}</Anchor> : c.title}{' '}
                <Text span c="dimmed">
                  ({c.imported}/{c.totalClips} clips{c.failed.length > 0 ? `, ${c.failed.length} failed` : ''}, {c.status})
                </Text>
              </ListItem>
            ))}
          </List>
        </Stack>
      )}

      {!progress && grouping && (
        <List size="sm" spacing="xs">
          {grouping.chapters.map((c) => (
            <ListItem key={c.title}>
              {c.title} <Text span c="dimmed">({c.clipCount} clips): {c.reason}</Text>
            </ListItem>
          ))}
        </List>
      )}
    </Stack>
  );
}
