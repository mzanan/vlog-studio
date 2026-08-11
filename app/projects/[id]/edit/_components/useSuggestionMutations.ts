'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useApiMutation } from './useApiMutation';
import { PlanResponse } from './Editor';

function requirePlanVersion(qc: ReturnType<typeof useQueryClient>, projectId: string): number {
  const planVersion = qc.getQueryData<PlanResponse>(['edl', projectId])?.planVersion;
  if (typeof planVersion !== 'number') throw new Error('estado del proyecto no cargado todavía, esperá y reintentá');
  return planVersion;
}

export function useSuggestionMutations(projectId: string, onChanged: () => void) {
  const qc = useQueryClient();
  const invalidateKeys = [['edl', projectId], ['render-props', projectId]];
  const errorInvalidateKeys = [['edl', projectId]];
  const syncPlanCache = { projectId };

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
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body;
    },
    invalidateKeys,
    errorInvalidateKeys,
    syncPlanCache,
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
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body;
    },
    invalidateKeys,
    errorInvalidateKeys,
    syncPlanCache,
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
      if (!res.ok) throw new Error(body?.error ?? 'falló');
      return body;
    },
    invalidateKeys,
    errorInvalidateKeys,
    syncPlanCache,
    onSuccessExtra: () => onChanged(),
    errorAutoClose: 6000,
  });

  return { accept, reject, bulk };
}
