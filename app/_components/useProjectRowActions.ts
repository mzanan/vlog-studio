'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApiMutation } from '@/app/projects/[id]/edit/_components/useApiMutation';

export function useProjectRowActions(projectId: string, initialName: string) {
  const router = useRouter();

  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const renameMutation = useApiMutation<string, unknown>({
    mutationFn: async (nextName: string) => {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Rename failed');
      return body;
    },
    onSuccessExtra: () => {
      setRenameOpen(false);
      router.refresh();
    },
  });

  const deleteMutation = useApiMutation<void, unknown>({
    mutationFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Delete failed');
      }
      return null;
    },
    onSuccessExtra: () => {
      setDeleteOpen(false);
      router.refresh();
    },
  });

  function openRename() {
    setName(initialName);
    setRenameOpen(true);
  }

  function submitRename() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === initialName) {
      setRenameOpen(false);
      return;
    }
    renameMutation.mutate(trimmed);
  }

  return {
    renameOpen,
    setRenameOpen,
    openRename,
    name,
    setName,
    submitRename,
    renameMutation,
    deleteOpen,
    setDeleteOpen,
    deleteMutation,
  };
}
