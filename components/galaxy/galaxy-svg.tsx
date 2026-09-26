"use client";

import { useEffect, useMemo, useState } from "react";
import { getCluster } from "@/lib/clusters";
import type { LayoutPoint } from "@/lib/galaxy-layout";
import { BOND_AT } from "@/lib/thread";
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
  threads = [],
  hidden,
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
      {mode === "people" && hidden
        ? [...new Set(nodes.map((n) => n.cluster))].flatMap((cl) => {
            const ps = nodes.filter((n) => n.cluster === cl && !n.isMe && points.get(n.userId)).map((n) => points.get(n.userId)!);
            const count = Math.min(40, Math.round(Math.sqrt(hidden.byCluster[cl] ?? 0) * 2));
            if (!ps.length || !count) return [];
            const cx = ps.reduce((a, p) => a + p.x, 0) / ps.length;
            const cy = ps.reduce((a, p) => a + p.y, 0) / ps.length;
            const spread = Math.max(2.5, ps.reduce((a, p) => a + Math.hypot(p.x - cx, p.y - cy), 0) / ps.length) * 1.4;
            // Golden-angle spiral: deterministic, evenly hazy, no RNG to shimmer.
            return Array.from({ length: count }, (_, i) => {
              const a = i * 2.399;
              const d = Math.sqrt((i + 0.5) / count) * spread;
              return <circle key={`dust-${cl}-${i}`} cx={cx + Math.cos(a) * d} cy={-(cy + Math.sin(a) * d)} r={0.16} fill={getCluster(cl).color} opacity={0.35} />;
            });
          })
        : null}
      {mode === "people" && meId && points.get(meId)
        ? threads.map((t) => {
            const a = points.get(meId)!;
            const b = points.get(t.userId);
            if (!b) return null;
            const bonded = t.count >= BOND_AT;
            return <line key={`thread-${t.userId}`} x1={a.x} y1={-a.y} x2={b.x} y2={-b.y} stroke={getCluster(clusterOf.get(t.userId) ?? "").color} strokeWidth={bonded ? 0.35 : 0.1} opacity={bonded ? 0.9 : 0.25} strokeLinecap="round" />;
          })
        : null}
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
            opacity={visible ? (dimmed ? 0.15 : n.far && !on ? 0.45 : 1) : 0}
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
