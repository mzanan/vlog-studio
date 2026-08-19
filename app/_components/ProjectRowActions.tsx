'use client';

import { ActionIcon, Button, Group, Modal, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useProjectRowActions } from './useProjectRowActions';

export function ProjectRowActions({
  projectId,
  name,
  clipCount,
}: {
  projectId: string;
  name: string;
  clipCount: number;
}) {
  const {
    renameOpen,
    setRenameOpen,
    openRename,
    name: draftName,
    setName,
    submitRename,
    renameMutation,
    deleteOpen,
    setDeleteOpen,
    deleteMutation,
  } = useProjectRowActions(projectId, name);

  return (
    <>
      <Group gap="xs" wrap="nowrap">
        <Tooltip label="Rename project" withinPortal>
          <ActionIcon variant="subtle" onClick={openRename} aria-label="Rename project">
            <IconPencil size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Delete project" withinPortal>
          <ActionIcon variant="subtle" color="red" onClick={() => setDeleteOpen(true)} aria-label="Delete project">
            <IconTrash size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Modal opened={renameOpen} onClose={() => setRenameOpen(false)} title="Rename project" centered>
        <Stack>
          <TextInput
            label="Name"
            value={draftName}
            onChange={(e) => setName(e.currentTarget.value)}
            maxLength={120}
            required
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitRename} loading={renameMutation.isPending} disabled={!draftName.trim()}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete project" centered>
        <Stack>
          <Text size="sm">
            This project has {clipCount} clip{clipCount === 1 ? '' : 's'}. Deleting it removes the project and its
            files from disk. This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => deleteMutation.mutate()} loading={deleteMutation.isPending}>
              Delete project
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
