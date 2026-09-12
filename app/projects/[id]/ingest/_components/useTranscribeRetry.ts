'use client';

import { useApiMutation } from '@/hooks/useApiMutation';

async function postRetry(url: string): Promise<{ queued: number }> {
  const res = await fetch(url, { method: 'POST' });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `request failed (${res.status})`);
  return json as { queued: number };
}

export function useTranscribeRetry(projectId: string) {
  const clipsKey = ['clips', projectId];

  const retryClip = useApiMutation<string, { queued: number }>({
    mutationFn: (clipId) => postRetry(`/api/projects/${projectId}/clips/${clipId}/transcribe`),
    invalidateKeys: [clipsKey],
    successMessage: 'Transcription queued',
  });

  const retryAllFailed = useApiMutation<void, { queued: number }>({
    mutationFn: () => postRetry(`/api/projects/${projectId}/clips/retry-transcription`),
    invalidateKeys: [clipsKey],
    successMessage: 'Retrying failed transcriptions',
  });

  return { retryClip, retryAllFailed };
}
