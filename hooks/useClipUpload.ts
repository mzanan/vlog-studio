'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

export type UploadStatus = 'pending' | 'uploading' | 'done' | 'error';
export type UploadQueueItem = { name: string; status: UploadStatus; error?: string };

async function uploadOne(projectId: string, file: File) {
  const res = await fetch(`/api/projects/${projectId}/clips`, {
    method: 'POST',
    headers: { 'x-filename': encodeURIComponent(file.name) },
    body: file,
  });
  if (!res.ok) throw new Error(await res.text());
}

export function useClipUpload(projectId: string) {
  const [queue, setQueue] = useState<UploadQueueItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setQueue(files.map((f) => ({ name: f.name, status: 'pending' })));
      setIsUploading(true);

      const updateAt = (index: number, patch: Partial<UploadQueueItem>) =>
        setQueue((q) => q.map((it, i) => (i === index ? { ...it, ...patch } : it)));

      let succeeded = 0;
      let failed = 0;
      for (let i = 0; i < files.length; i++) {
        updateAt(i, { status: 'uploading' });
        try {
          await uploadOne(projectId, files[i]);
          succeeded++;
          updateAt(i, { status: 'done' });
        } catch (err) {
          failed++;
          updateAt(i, { status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
        qc.invalidateQueries({ queryKey: ['clips', projectId] });
      }

      router.refresh();
      setIsUploading(false);

      if (succeeded > 0) {
        notifications.show({
          color: 'teal',
          message: `${succeeded} clip${succeeded === 1 ? '' : 's'} subido${succeeded === 1 ? '' : 's'}${failed ? `, ${failed} con error` : ''}`,
        });
      } else if (failed > 0) {
        notifications.show({ color: 'red', message: `${failed} clip${failed === 1 ? '' : 's'} fallaron`, autoClose: 8000 });
      }
    },
    [projectId, qc, router],
  );

  return { queue, isUploading, uploadFiles };
}
