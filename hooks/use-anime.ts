"use client";

import { useLayoutEffect, useRef, type DependencyList, type RefObject } from "react";
import { createScope, type Scope } from "animejs";

/**
 * Runs anime.js animations scoped to a root element. Selectors inside `setup` resolve
 * within the root, and everything is reverted on unmount or when deps change.
 * `setup` is skipped entirely under prefers-reduced-motion, so animations must only
 * ever animate *from* a hidden state back to the element's natural styles.
 */
export function useAnime<T extends HTMLElement | SVGElement = HTMLDivElement>(
  setup: (root: T, scope: Scope) => void | (() => void),
  deps: DependencyList = [],
): RefObject<T | null> {
  const root = useRef<T>(null);

  useLayoutEffect(() => {
    if (!root.current) return;
    const scope = createScope({ root: root as RefObject<HTMLElement>, mediaQueries: { reduce: "(prefers-reduced-motion: reduce)" } }).add((self) => {
      if (self?.matches.reduce) return;
      return setup(root.current!, self!);
    });
    return () => scope.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls re-runs via deps
  }, deps);

  return root;
}
