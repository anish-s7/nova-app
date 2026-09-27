"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/use-capabilities";

/** The two ring colors: the app's gold and a violet from the cluster palette. */
const VIOLET = "oklch(0.66 0.11 300)";

/**
 * A thin gold/violet outline whose colors slowly travel around its parent (the active tab's
 * highlight). Drawn as an SVG stroke sized to the parent, matching its corner radius, instead of a
 * masked CSS gradient: Chrome can drop CSS mask cut-outs on composited layers (over the galaxy's
 * WebGL canvas, or mid-animation), which filled the whole pill with the gradient. Static with
 * reduced motion. The parent must be positioned.
 */
export function DuoRing({ width = 1.5 }: { width?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0, r: 0 });
  const reduced = useReducedMotion();
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    const svg = ref.current;
    const parent = svg?.parentElement;
    if (!svg || !parent) return;
    const measure = () => {
      const r = parseFloat(getComputedStyle(parent).borderTopLeftRadius) || 0;
      setBox({ w: parent.clientWidth, h: parent.clientHeight, r });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const inset = width / 2;
  const w = Math.max(0, box.w - width);
  const h = Math.max(0, box.h - width);
  const r = Math.min(Math.max(0, box.r - inset), h / 2, w / 2);

  return (
    <svg ref={ref} className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`duo-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--primary)" }} />
          <stop offset="0.5" style={{ stopColor: VIOLET }} />
          <stop offset="1" style={{ stopColor: "var(--primary)" }} />
          {reduced ? null : <animateTransform attributeName="gradientTransform" type="rotate" from="0 0.5 0.5" to="360 0.5 0.5" dur="4s" repeatCount="indefinite" />}
        </linearGradient>
      </defs>
      {box.w > 0 ? <rect x={inset} y={inset} width={w} height={h} rx={r} ry={r} fill="none" stroke={`url(#duo-${id})`} strokeWidth={width} /> : null}
    </svg>
  );
}
