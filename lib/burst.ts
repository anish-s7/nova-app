"use client";

import { animate, stagger, utils } from "animejs";

/** A brief ring of sparks from a point inside `host` (which must be position: relative). */
export function burst(host: HTMLElement, x: number, y: number, color: string, count = 12) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const sparks = Array.from({ length: count }, () => {
    const s = document.createElement("span");
    s.setAttribute("aria-hidden", "true");
    Object.assign(s.style, {
      position: "absolute",
      left: `${x}px`,
      top: `${y}px`,
      width: "5px",
      height: "5px",
      margin: "-2.5px 0 0 -2.5px",
      borderRadius: "9999px",
      background: color,
      boxShadow: `0 0 8px ${color}`,
      pointerEvents: "none",
      zIndex: "10",
    });
    host.appendChild(s);
    return s;
  });
  animate(sparks, {
    translateX: (_?: unknown, i = 0) => Math.cos((i / count) * Math.PI * 2) * utils.random(28, 46),
    translateY: (_?: unknown, i = 0) => Math.sin((i / count) * Math.PI * 2) * utils.random(20, 34),
    scale: [1, 0],
    opacity: [1, 0],
    duration: () => utils.random(600, 900),
    delay: stagger(8),
    ease: "outExpo",
    onComplete: () => sparks.forEach((s) => s.remove()),
  });
}
