'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Group, Modal, Stack, Textarea, TextInput } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

export function NewProjectButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [intent, setIntent] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, intent: intent || null }),
      });
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{ id: string }>;
    },
    onSuccess: (data) => {
      setOpen(false);
      setName('');
      setIntent('');
      router.push(`/projects/${data.id}/ingest`);
    },
    onError: () => notifications.show({ color: 'red', message: 'Could not create the project' }),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)} maw={220}>
        New project
      </Button>

      <Modal opened={open} onClose={() => setOpen(false)} title="New project" centered>
        <Stack>
          <TextInput
            label="Name"
            placeholder="Vlog Bariloche"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
          />
          <Textarea
            label="Intent"
            description="Brief for the AI editor (tone, approximate duration, audience)"
            placeholder="Travel vlog, casual, ~5min, general audience"
            value={intent}
            onChange={(e) => setIntent(e.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
              disabled={!name.trim()}
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
