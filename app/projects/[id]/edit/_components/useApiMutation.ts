'use client';

import { QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import type { PlanResponse } from './Editor';

type PlanCacheResult = { planVersion?: number; edl?: PlanResponse['edl']; suggestions?: PlanResponse['suggestions'] };

export function useApiMutation<TArgs = void, TResult = unknown>(opts: {
  mutationFn: (args: TArgs) => Promise<TResult>;
  invalidateKeys?: QueryKey[];
  // Solo se invalida en error si se pasa explícitamente (ej. ['edl', projectId] tras
  // un 409 de stale-write, para refrescar el estado real). NUNCA incluir render-props
  // acá: invalidarlo en cualquier error (no solo conflictos) resetea el player en vivo.
  errorInvalidateKeys?: QueryKey[];
  // Si el resultado trae planVersion (todas las mutaciones de edl/suggestions lo
  // devuelven ahora), lo escribe en la cache de forma síncrona en vez de esperar el
  // refetch async de invalidateQueries. Sin esto, dos acciones rápidas seguidas leen
  // el mismo planVersion viejo desde cache y la segunda 409ea con un falso conflicto.
  syncPlanCache?: { projectId: string };
  successMessage?: string;
  onSuccessExtra?: (result: TResult) => void;
  errorAutoClose?: number;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.mutationFn,
    onSuccess: (result) => {
      if (opts.syncPlanCache) {
        const r = result as PlanCacheResult;
        if (typeof r?.planVersion === 'number') {
          qc.setQueryData<PlanResponse>(['edl', opts.syncPlanCache.projectId], (old) =>
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
      }
      for (const key of opts.invalidateKeys ?? []) qc.invalidateQueries({ queryKey: key });
      if (opts.successMessage) notifications.show({ color: 'teal', message: opts.successMessage });
      opts.onSuccessExtra?.(result);
    },
    onError: (err) => {
      for (const key of opts.errorInvalidateKeys ?? []) qc.invalidateQueries({ queryKey: key });
      notifications.show({ color: 'red', message: err.message, autoClose: opts.errorAutoClose ?? 8000 });
    },
  });
}
