"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { animate, utils } from "animejs";
import { getCluster } from "@/lib/clusters";
import { CLUSTER_IDS } from "@/lib/clusters";

export type WarpHandle = { play: (duration: number) => Promise<void> };

const STREAKS = 46;
const COLORS = [...CLUSTER_IDS.map((id) => getCluster(id).color), "#f3c98b", "#ffffff"];

/** Rounded so the SSR and client renders serialize to the exact same string. */
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Seeded-ish spread so streaks always start from the same layout, just replayed. */
const LINES = Array.from({ length: STREAKS }, (_, i) => {
  const a = (i / STREAKS) * Math.PI * 2 + Math.sin(i * 7.1) * 0.35;
  const r0 = 4 + ((i * 13) % 10);
  return { a, x0: round(Math.cos(a) * r0), y0: round(Math.sin(a) * r0), color: COLORS[i % COLORS.length], w: 0.4 + ((i * 3) % 5) * 0.15 };
});

/**
 * A radial field of light streaking outward from center, as if the camera is punching through
 * the starfield. Purely decorative, laid over GalaxyCanvas during its big travel moves.
 */
export const WarpOverlay = forwardRef<WarpHandle>(function WarpOverlay(_props, ref) {
  const svgRef = useRef<SVGSVGElement>(null);

  useImperativeHandle(ref, () => ({
    play: (duration: number) =>
      new Promise<void>((resolve) => {
        const svg = svgRef.current;
        if (!svg || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          resolve();
          return;
        }
        const lines = Array.from(svg.querySelectorAll<SVGLineElement>("[data-streak]"));
        utils.set(lines, { opacity: 0 });
        const out = 70;
        const tl = animate(lines, {
          // Fades in, holds bright, fades out — while the streak itself shoots to full length
          // fast (outExpo) and holds there, so most of the duration reads as long, bright trails.
          opacity: [0, 1, 1, 0],
          x2: { to: (_el, i) => round(Math.cos(LINES[i ?? 0].a) * out), ease: "outExpo" },
          y2: { to: (_el, i) => round(Math.sin(LINES[i ?? 0].a) * out), ease: "outExpo" },
          duration,
          delay: (_el, i) => ((i ?? 0) % 7) * 12,
          onComplete: () => resolve(),
        });
        return () => tl.pause();
      }),
  }));

  return (
    <svg ref={svgRef} viewBox="-50 -50 100 100" className="pointer-events-none absolute inset-0 z-[5] size-full opacity-90" aria-hidden>
      <g style={{ mixBlendMode: "screen" }}>
        {LINES.map((l, i) => (
          <line
            key={i}
            data-streak
            x1={l.x0}
            y1={l.y0}
            x2={l.x0}
            y2={l.y0}
            stroke={l.color}
            strokeWidth={l.w}
            strokeLinecap="round"
            opacity={0}
          />
        ))}
      </g>
    </svg>
  );
});
