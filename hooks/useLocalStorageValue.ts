'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';

const CHANGE_EVENT = 'vlog-studio:local-storage-change';

export function useLocalStorageValue<T>(key: string, parse: (raw: string | null) => T): T {
  const cache = useRef<{ raw: string | null; value: T }>(undefined);

  const readAndCache = useCallback(() => {
    const raw = window.localStorage.getItem(key);
    const value = parse(raw);
    cache.current = { raw, value };
    return value;
  }, [key, parse]);

  const getSnapshot = useCallback(() => (cache.current ? cache.current.value : readAndCache()), [readAndCache]);
  const getServerSnapshot = useCallback(() => parse(null), [parse]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const handler = () => {
        readAndCache();
        onChange();
      };
      window.addEventListener(CHANGE_EVENT, handler);
      window.addEventListener('storage', handler);
      return () => {
        window.removeEventListener(CHANGE_EVENT, handler);
        window.removeEventListener('storage', handler);
      };
    },
    [readAndCache],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setLocalStorageValue(key: string, value: string) {
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
