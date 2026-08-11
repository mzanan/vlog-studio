import { QueryClient } from '@tanstack/react-query';
import { PlanResponse } from './project';

type PlanCacheResult = { planVersion?: number; edl?: PlanResponse['edl']; suggestions?: PlanResponse['suggestions'] };

export function requirePlanVersion(qc: QueryClient, projectId: string): number {
  const planVersion = qc.getQueryData<PlanResponse>(['edl', projectId])?.planVersion;
  if (typeof planVersion !== 'number') throw new Error('estado del proyecto no cargado todavía, esperá y reintentá');
  return planVersion;
}

export function syncPlanCache(qc: QueryClient, projectId: string, result: unknown): void {
  const r = result as PlanCacheResult;
  if (typeof r?.planVersion !== 'number') return;
  qc.setQueryData<PlanResponse>(['edl', projectId], (old) =>
    old
      ? {
          ...old,
          planVersion: r.planVersion as number,
          ...(r.edl !== undefined ? { edl: r.edl } : {}),
          ...(r.suggestions !== undefined ? { suggestions: r.suggestions } : {}),
        }
      : old,
  );
}
