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
    onError: () => notifications.show({ color: 'red', message: 'No se pudo crear el proyecto' }),
  });

  return (
    <>
      <Button onClick={() => setOpen(true)} maw={220}>
        Nuevo proyecto
      </Button>

      <Modal opened={open} onClose={() => setOpen(false)} title="Nuevo proyecto" centered>
        <Stack>
          <TextInput
            label="Nombre"
            placeholder="Vlog Bariloche"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
          />
          <Textarea
            label="Intent"
            description="Brief para el editor AI (tono, duración aproximada, audiencia)"
            placeholder="Vlog de viaje, casual, ~5min, audiencia general"
            value={intent}
            onChange={(e) => setIntent(e.currentTarget.value)}
            autosize
            minRows={2}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
              disabled={!name.trim()}
            >
              Crear
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
