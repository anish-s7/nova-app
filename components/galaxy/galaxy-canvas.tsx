"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion, useWebGL } from "@/hooks/use-capabilities";
import type { Arrival } from "@/hooks/use-galaxy-realtime";
import { computeLayout, placeArrival } from "@/lib/galaxy-layout";
import type { GalaxyEdge, GalaxyNode } from "@/lib/types";
import { GalaxySvg } from "./galaxy-svg";
import type { GalaxyViewProps } from "./types";

export function GalaxySkeleton({ label }: { label?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 starfield">
      <span className="relative flex size-4 items-center justify-center" aria-hidden>
        <span className="absolute size-10 rounded-full bg-primary/15 motion-safe:animate-orbit-pulse" />
        <span className="size-2 rounded-full bg-primary" />
      </span>
      {label ? <p className="font-serif text-base italic text-muted-foreground">{label}</p> : null}
    </div>
  );
}

const GalaxyScene = dynamic(() => import("./galaxy-scene"), {
  ssr: false,
  loading: () => <GalaxySkeleton />,
});

type Props = Omit<GalaxyViewProps, "layout" | "extra"> & {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  arrivals?: Arrival[];
  className?: string;
};

export function GalaxyCanvas({ nodes, edges, arrivals = [], className, ...rest }: Props) {
  const layout = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);
  const extra = useMemo(() => arrivals.map((a) => placeArrival(layout, a.node, a.edges)), [arrivals, layout]);
  const allNodes = useMemo(() => [...nodes, ...arrivals.map((a) => a.node)], [nodes, arrivals]);
  const allEdges = useMemo(() => [...edges, ...arrivals.flatMap((a) => a.edges)], [edges, arrivals]);

  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const View = reduced || !webgl ? GalaxySvg : GalaxyScene;

  return (
    <div className={className ?? "absolute inset-0 starfield"}>
      <View nodes={allNodes} edges={allEdges} layout={layout} extra={extra} {...rest} />
    </div>
  );
}
