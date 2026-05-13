'use client';

import { QueryKey, useMutation, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';

export function useApiMutation<TArgs = void, TResult = unknown>(opts: {
  mutationFn: (args: TArgs) => Promise<TResult>;
  invalidateKeys?: QueryKey[];
  successMessage?: string;
  onSuccessExtra?: (result: TResult) => void;
  errorAutoClose?: number;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.mutationFn,
    onSuccess: (result) => {
      for (const key of opts.invalidateKeys ?? []) qc.invalidateQueries({ queryKey: key });
      if (opts.successMessage) notifications.show({ color: 'teal', message: opts.successMessage });
      opts.onSuccessExtra?.(result);
    },
    onError: (err) =>
      notifications.show({ color: 'red', message: err.message, autoClose: opts.errorAutoClose ?? 8000 }),
  });
}
