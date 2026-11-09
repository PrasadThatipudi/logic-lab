import { useCallback, useState } from 'react';

const key = (k: string) => `logiclab.${k}`;

export const storage = {
  get(k: string): string | null {
    try { return localStorage.getItem(key(k)); } catch { return null; }
  },
  set(k: string, v: string) {
    try { localStorage.setItem(key(k), v); } catch { /* storage unavailable */ }
  },
};

/** String state persisted under `logiclab.<name>`. */
export function useStoredState<T extends string>(name: string, fallback: () => T, valid: (v: string) => v is T) {
  const [value, setValue] = useState<T>(() => {
    const v = storage.get(name);
    return v !== null && valid(v) ? v : fallback();
  });
  const set = useCallback((next: T) => { storage.set(name, next); setValue(next); }, [name]);
  return [value, set] as const;
}
