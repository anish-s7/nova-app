"use client";

import { useEffect, useMemo, useState } from "react";
import { getCluster } from "@/lib/clusters";
import type { LayoutPoint } from "@/lib/galaxy-layout";
import { cn } from "@/lib/utils";
import type { GalaxyViewProps } from "./types";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 2D fallback for no-WebGL and reduced motion. Same layout, z dropped; choreography becomes crossfades. */
export function GalaxySvg({
  nodes,
  edges,
  layout,
  extra,
  selectedId,
  onSelect,
  apiRef,
  initialPhase = "explore",
  interactive = true,
  onReady,
  compact = false,
  focusCluster = null,
  mode = "people",
  focusIds = null,
}: GalaxyViewProps & { compact?: boolean }) {
  const [phase, setPhase] = useState<"dark" | "me" | "all">(initialPhase === "dark" ? "dark" : "all");
  const [focus, setFocus] = useState<string | null>(null);

  const points = useMemo(() => {
    const m = new Map<string, LayoutPoint>(layout.points);
    for (const p of extra) m.set(p.id, p);
    return m;
  }, [layout, extra]);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      igniteMe: async () => {
        setPhase("me");
        await wait(500);
      },
      pullBackToOverview: async () => {
        setPhase("all");
        await wait(600);
      },
      flyTo: async (id) => {
        setFocus(id);
        await wait(300);
      },
      recenter: async () => setFocus(null),
      flyToCluster: async () => setFocus(null),
      flyToGroup: async () => setFocus(null),
    };
    onReady?.();
    return () => {
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register once
  }, []);

  const r = layout.radius * 1.15;
  const meId = nodes.find((n) => n.isMe)?.userId;
  const highlight = selectedId ?? focus;
  const clusterOf = new Map(nodes.map((n) => [n.userId, n.cluster]));

  return (
    <svg
      viewBox={`${-r} ${-r * 1.4} ${r * 2} ${r * 2.8}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 size-full"
      role={interactive ? "group" : "img"}
      aria-label="Galaxy of listeners, grouped by why they listen"
    >
      <defs>
        <radialGradient id="glow">
          <stop offset="0%" stopColor="white" stopOpacity="0.9" />
          <stop offset="35%" stopColor="white" stopOpacity="0.35" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="transition-opacity duration-700" opacity={phase === "all" ? 1 : 0}>
        {edges
          .filter((e) => e.similarity >= 0.6 && points.has(e.source) && points.has(e.target))
          .map((e) => {
            const a = points.get(e.source)!;
            const b = points.get(e.target)!;
            const touched = highlight && (e.source === highlight || e.target === highlight);
            return (
              <line
                key={`${e.source}-${e.target}`}
                x1={a.x}
                y1={-a.y}
                x2={b.x}
                y2={-b.y}
                stroke={getCluster(clusterOf.get(e.source) ?? "").color}
                strokeWidth={touched ? 0.18 : 0.08}
                opacity={touched ? 0.8 : 0.08 + (e.similarity - 0.6) * 0.6}
              />
            );
          })}
      </g>
      {nodes.map((n) => {
        const p = points.get(n.userId);
        if (!p) return null;
        const color = getCluster(n.cluster).color;
        const song = n.kind === "song";
        // The song layer and the people layer take turns; the other one is ghosted or hidden.
        const visible = n.isMe ? phase !== "dark" : phase === "all" && (!song || mode === "songs");
        const dimmed = song ? !!focusIds && !focusIds.has(n.userId) : !n.isMe && (mode === "songs" || (!!focusCluster && n.cluster !== focusCluster));
        const on = n.userId === highlight;
        const size = n.isMe ? 1.3 : on ? 1.1 : song ? 0.5 + 0.1 * Math.min(6, n.weight ?? 1) : 0.75;
        return (
          <g
            key={n.userId}
            transform={`translate(${p.x} ${-p.y})`}
            className={cn("transition-opacity duration-700", interactive && "cursor-pointer")}
            opacity={visible ? (dimmed ? 0.15 : 1) : 0}
            onClick={interactive ? () => onSelect?.(n.userId) : undefined}
          >
            <circle r={size * 2.6} fill={color} opacity={0.18} />
            <circle r={size} fill={color} />
            <circle r={size * 0.45} fill="url(#glow)" />
            {interactive ? <circle r={3} fill="transparent" /> : null}
            {n.userId === meId && !compact ? (
              <text y={3.2} textAnchor="middle" className="fill-primary text-[1.6px] font-semibold">
                You
              </text>
            ) : null}
            {(on || (song && !dimmed && mode === "songs" && (n.weight ?? 1) >= 5)) && !n.isMe ? (
              <text y={2.8} textAnchor="middle" className="fill-foreground text-[1.5px] font-semibold">
                {n.name}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
