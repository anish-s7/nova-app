"use client";

import { useCallback, useRef } from "react";

/**
 * Paces a choreographed sequence. Normally each beat waits on a timer (a tap skips ahead);
 * in demo mode each beat waits for the presenter to tap.
 */
export function usePacer(demo: boolean) {
  const resolver = useRef<(() => void) | null>(null);

  const wait = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        if (demo) {
          resolver.current = resolve;
          return;
        }
        const t = setTimeout(() => {
          resolver.current = null;
          resolve();
        }, ms);
        resolver.current = () => {
          clearTimeout(t);
          resolve();
        };
      }),
    [demo],
  );

  const advance = useCallback(() => {
    const r = resolver.current;
    resolver.current = null;
    r?.();
  }, []);

  return { wait, advance };
}
