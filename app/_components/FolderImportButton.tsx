'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  MantineSize,
  Modal,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconArrowUp, IconFolder, IconFolderPlus, IconVideo } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

type BrowseEntry = { name: string; path: string; isDirectory: boolean; videoCount: number };
type BrowseListing = { path: string; parent: string | null; root: string; entries: BrowseEntry[] };
type ImportResult = { imported: number; failed: { file: string; error: string }[] };

export function FolderImportButton({
  projectId,
  size = 'sm',
  label = 'Add folders',
}: {
  projectId: string;
  size?: MantineSize;
  label?: string;
}) {
  const [opened, setOpened] = useState(false);
  const [dir, setDir] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const qc = useQueryClient();
  const router = useRouter();

  const listing = useQuery({
    queryKey: ['fs-browse', dir],
    queryFn: async () => {
      const qs = dir ? `?path=${encodeURIComponent(dir)}` : '';
      const res = await fetch(`/api/fs/browse${qs}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'failed');
      return body as BrowseListing;
    },
    enabled: opened,
  });

  const importPaths = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/clips/import-paths`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paths: selected }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'failed');
      return body as ImportResult;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['clips', projectId] });
      router.refresh();
      setSelected([]);
      setOpened(false);
      if (result.imported === 0) {
        notifications.show({ color: 'yellow', message: 'No video files found in the selection' });
        return;
      }
      notifications.show({
        color: 'teal',
        message: `${result.imported} clips imported${result.failed.length ? `, ${result.failed.length} failed` : ''}`,
      });
    },
    onError: (err) => notifications.show({ color: 'red', message: err.message, autoClose: 8000 }),
  });

  const toggle = (entryPath: string) =>
    setSelected((prev) =>
      prev.includes(entryPath) ? prev.filter((p) => p !== entryPath) : [...prev, entryPath],
    );

  return (
    <>
      <Button
        variant="default"
        size={size}
        leftSection={<IconFolderPlus size={16} />}
        onClick={() => setOpened(true)}
      >
        {label}
      </Button>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Import from disk"
        size="lg"
        closeOnClickOutside={!importPaths.isPending}
      >
        <Stack gap="sm">
          <Group gap="xs" wrap="nowrap">
            <Button
              variant="default"
              size="xs"
              leftSection={<IconArrowUp size={14} />}
              disabled={!listing.data?.parent || listing.isFetching}
              onClick={() => setDir(listing.data?.parent ?? null)}
            >
              Up
            </Button>
            <Text size="xs" c="dimmed" truncate>
              {listing.data?.path ?? '…'}
            </Text>
          </Group>

          {listing.isLoading ? (
            <Group justify="center" p="lg"><Loader size="sm" /></Group>
          ) : listing.error ? (
            <Text size="sm" c="red">{(listing.error as Error).message}</Text>
          ) : listing.data?.entries.length === 0 ? (
            <Text size="sm" c="dimmed">Empty folder.</Text>
          ) : (
            <ScrollArea.Autosize mah={360}>
              <Stack gap={2}>
                {listing.data?.entries.map((entry) => (
                  <Group key={entry.path} gap="xs" wrap="nowrap">
                    <Checkbox
                      size="xs"
                      checked={selected.includes(entry.path)}
                      onChange={() => toggle(entry.path)}
                    />
                    {entry.isDirectory ? (
                      <UnstyledButton onClick={() => setDir(entry.path)} style={{ flex: 1 }}>
                        <Group gap={6} wrap="nowrap">
                          <IconFolder size={16} />
                          <Text size="sm" truncate>{entry.name}</Text>
                          <Badge size="xs" variant="light">{entry.videoCount}</Badge>
                        </Group>
                      </UnstyledButton>
                    ) : (
                      <Group gap={6} wrap="nowrap" style={{ flex: 1 }}>
                        <IconVideo size={16} />
                        <Text size="sm" truncate>{entry.name}</Text>
                      </Group>
                    )}
                  </Group>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          )}

          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {selected.length === 0 ? 'Nothing selected' : `${selected.length} selected`}
            </Text>
            <Group gap="xs">
              <Button variant="subtle" size="xs" disabled={selected.length === 0} onClick={() => setSelected([])}>
                Clear
              </Button>
              <Button
                size="xs"
                disabled={selected.length === 0}
                loading={importPaths.isPending}
                onClick={() => importPaths.mutate()}
              >
                Import
              </Button>
            </Group>
          </Group>

          <Text size="xs" c="dimmed">
            Folders are read recursively. Selection survives navigation, so you can tick folders in different places before importing.
          </Text>
        </Stack>
      </Modal>
    </>
  );
}
