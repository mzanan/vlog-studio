'use client';

import { QueryClient, QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

export function useApiMutation<TArgs = void, TResult = unknown>(opts: {
  mutationFn: (args: TArgs) => Promise<TResult>;
  invalidateKeys?: QueryKey[];
  errorInvalidateKeys?: QueryKey[];
  onSuccessCache?: (result: TResult, qc: QueryClient) => void;
  successMessage?: string;
  onSuccessExtra?: (result: TResult) => void;
  errorAutoClose?: number;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.mutationFn,
    onSuccess: (result) => {
      opts.onSuccessCache?.(result, qc);
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
