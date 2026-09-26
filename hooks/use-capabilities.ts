"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(QUERY).matches, () => false);
}

let webgl: boolean | undefined;
function detectWebGL() {
  if (webgl === undefined) {
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

const noop = () => () => {};

export function useWebGL() {
  return useSyncExternalStore(noop, detectWebGL, () => true);
}
