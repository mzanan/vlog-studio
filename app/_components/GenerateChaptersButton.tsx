'use client';

import { useRouter } from 'next/navigation';
import { Anchor, Button, Group, List, ListItem, Stack, Text } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

type ChapterSummary = { title: string; reason: string; clipCount: number };
type SavedGrouping = { generatedAt: string; chapters: ChapterSummary[] };

type ImportResult = {
  projectId: string;
  title: string;
  reason: string;
  imported: number;
  failed: { clip: string; error: string }[];
};

export function GenerateChaptersButton({ initialGrouping }: { initialGrouping: SavedGrouping | null }) {
  const router = useRouter();

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/chapters/generate', { method: 'POST' });
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<SavedGrouping>;
    },
    onSuccess: () => router.refresh(),
    onError: () => notifications.show({ color: 'red', message: 'Chapter grouping failed' }),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/chapters/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxChapters: 2 }),
      });
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{ chapters: ImportResult[] }>;
    },
    onSuccess: () => router.refresh(),
    onError: () => notifications.show({ color: 'red', message: 'Chapter import failed' }),
  });

  const grouping = generateMutation.data ?? initialGrouping;

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
            onClick={() => importMutation.mutate()}
            loading={importMutation.isPending}
          >
            Import chapters (test: first 2)
          </Button>
        )}
      </Group>

      {generateMutation.isPending && <Text size="sm" c="dimmed">Grouping clips with the LLM...</Text>}
      {importMutation.isPending && <Text size="sm" c="dimmed">Importing clips, this can take a while, no progress feedback yet...</Text>}

      {grouping && !importMutation.data && (
        <List size="sm" spacing="xs">
          {grouping.chapters.map((c) => (
            <ListItem key={c.title}>
              {c.title} <Text span c="dimmed">({c.clipCount} clips): {c.reason}</Text>
            </ListItem>
          ))}
        </List>
      )}

      {importMutation.data && (
        <List size="sm" spacing="xs">
          {importMutation.data.chapters.map((c) => (
            <ListItem key={c.projectId}>
              <Anchor href={`/projects/${c.projectId}/edit`}>{c.title}</Anchor>{' '}
              <Text span c="dimmed">
                ({c.imported} clips{c.failed.length > 0 ? `, ${c.failed.length} failed` : ''})
              </Text>
            </ListItem>
          ))}
        </List>
      )}
    </Stack>
  );
}
