'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from './useApiMutation';
import { requirePlanVersion, syncPlanCache } from '@/lib/plan-version';

export function useSuggestionMutations(projectId: string, onChanged: () => void) {
  const qc = useQueryClient();
  const invalidateKeys = [['edl', projectId], ['render-props', projectId]];
  const errorInvalidateKeys = [['edl', projectId]];
  const onSuccessCache = (result: unknown) => syncPlanCache(qc, projectId, result);

  const accept = useApiMutation({
    mutationFn: async (suggestionId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/suggestions/${suggestionId}/accept`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedPlanVersion: requirePlanVersion(qc, projectId) }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'failed');
      return body;
    },
    invalidateKeys,
    errorInvalidateKeys,
    onSuccessCache,
    onSuccessExtra: () => onChanged(),
    errorAutoClose: 6000,
  });

  const reject = useApiMutation({
    mutationFn: async (suggestionId: string) => {
      const res = await fetch(
        `/api/projects/${projectId}/suggestions/${suggestionId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedPlanVersion: requirePlanVersion(qc, projectId) }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'failed');
      return body;
    },
    invalidateKeys,
    errorInvalidateKeys,
    onSuccessCache,
    onSuccessExtra: () => onChanged(),
    errorAutoClose: 6000,
  });

  const bulk = useApiMutation({
    mutationFn: async (args: { ids: string[]; action: 'accept' | 'reject' }) => {
      const res = await fetch(`/api/projects/${projectId}/suggestions/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...args, expectedPlanVersion: requirePlanVersion(qc, projectId) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'failed');
      return body;
    },
    invalidateKeys,
    errorInvalidateKeys,
    onSuccessCache,
    onSuccessExtra: () => onChanged(),
    errorAutoClose: 6000,
  });

  return { accept, reject, bulk };
}
