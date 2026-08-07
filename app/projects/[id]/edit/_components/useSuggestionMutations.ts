'use client';

import { useApiMutation } from './useApiMutation';

export function useSuggestionMutations(projectId: string, onChanged: () => void) {
  const invalidateKeys = [['edl', projectId], ['render-props', projectId]];

  const accept = useApiMutation({
    mutationFn: async (suggestionId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/suggestions/${suggestionId}/accept`,
        { method: 'POST' },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body;
    },
    invalidateKeys,
    onSuccessExtra: () => onChanged(),
    errorAutoClose: 6000,
  });

  const reject = useApiMutation({
    mutationFn: async (suggestionId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/suggestions/${suggestionId}/reject`,
        { method: 'POST' },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body;
    },
    invalidateKeys,
    onSuccessExtra: () => onChanged(),
    errorAutoClose: 6000,
  });

  const bulk = useApiMutation({
    mutationFn: async (args: { ids: string[]; action: 'accept' | 'reject' }) => {
      const res = await fetch(`/api/projects/${projectId}/suggestions/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body;
    },
    invalidateKeys,
    onSuccessExtra: () => onChanged(),
    errorAutoClose: 6000,
  });

  return { accept, reject, bulk };
}
