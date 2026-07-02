import { useState, useEffect } from "react";

/**
 * A number state that persists to localStorage. Used for planning inputs the
 * backend doesn't store yet (cash in hand, emergency fund, current extra
 * payment). Keyed per user where relevant by passing a user-scoped key.
 */
export function usePersistentNumber(key: string, initial: number) {
  const [value, setValue] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null && raw !== "" ? Number(raw) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
