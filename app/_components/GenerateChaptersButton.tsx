'use client';

import { useRouter } from 'next/navigation';
import { Anchor, Button, List, ListItem, Stack, Text } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

type ChapterResult = {
  projectId: string;
  title: string;
  reason: string;
  imported: number;
  failed: { clip: string; error: string }[];
};

export function GenerateChaptersButton() {
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/chapters/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxChapters: 2 }),
      });
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{ chapters: ChapterResult[] }>;
    },
    onSuccess: () => router.refresh(),
    onError: () => notifications.show({ color: 'red', message: 'Chapter generation failed' }),
  });

  return (
    <Stack gap="xs">
      <Button
        variant="light"
        onClick={() => mutation.mutate()}
        loading={mutation.isPending}
        maw={280}
      >
        Group Tokyo clips into chapters (test: first 2)
      </Button>
      {mutation.isPending && <Text size="sm" c="dimmed">Importing clips, this can take a while, no progress feedback yet...</Text>}
      {mutation.data && (
        <List size="sm" spacing="xs">
          {mutation.data.chapters.map((c) => (
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
