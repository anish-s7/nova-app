"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { GalaxySkeleton } from "@/components/galaxy/galaxy-canvas";
import type { GalaxyApi } from "@/components/galaxy/types";
import { computeLayout, type Layout } from "@/lib/galaxy-layout";
import { DEFAULT_BUDGET, cosine, knnEdges, sampleGalaxy } from "@/lib/galaxy-sample";
import { generatePopulation } from "@/lib/sim/population";
import type { GalaxyEdge, GalaxyNode } from "@/lib/types";
import { cn } from "@/lib/utils";

const GalaxyScene = dynamic(() => import("@/components/galaxy/galaxy-scene"), { ssr: false, loading: () => <GalaxySkeleton /> });

const SIZES = [100, 250, 500, 1000, 2500, 5000] as const;
const SEED = 7;

type Mode = "all" | "bounded";

type Run = {
  n: number;
  mode: Mode;
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  layout: Layout;
  hidden: number;
  hiddenBy?: { total: number; byCluster: Record<string, number> };
  far: number;
  ms: { sample: number; edges: number; layout: number };
  payloadKb: number;
  /** Share of drawn people with another person almost on top of them. */
  crowding: number;
  clusters: number;
  meanSimilarity: number;
};

/** Fraction of points with a neighbor closer than `r` layout units, via a spatial hash so 5k stays cheap. */
function crowding(layout: Layout, r = 0.9) {
  const cells = new Map<string, { x: number; y: number; z: number }[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / r)},${Math.floor(y / r)},${Math.floor(z / r)}`;
  const pts = [...layout.points.values()];
  for (const p of pts) {
    const k = key(p.x, p.y, p.z);
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(p);
  }
  let crowded = 0;
  for (const p of pts) {
    const [cx, cy, cz] = [Math.floor(p.x / r), Math.floor(p.y / r), Math.floor(p.z / r)];
    let hit = false;
    for (let dx = -1; dx <= 1 && !hit; dx++)
      for (let dy = -1; dy <= 1 && !hit; dy++)
        for (let dz = -1; dz <= 1 && !hit; dz++)
          for (const o of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) if (o !== p && Math.hypot(o.x - p.x, o.y - p.y, o.z - p.z) < r) hit = true;
    if (hit) crowded++;
  }
  return pts.length ? crowded / pts.length : 0;
}

function build(n: number, mode: Mode): Run {
  const pop = generatePopulation(n, SEED);
  const me = pop[0];
  const others = pop.slice(1).map((p) => ({ ...p, similarity: Math.max(0, cosine(me.vector, p.vector)) }));

  let t = performance.now();
  const sample = mode === "bounded" ? sampleGalaxy(others, { budget: DEFAULT_BUDGET, seed: "scale" }) : null;
  const keep = new Set(sample ? sample.ids : others.map((p) => p.id));
  const drawn = [me, ...others.filter((p) => keep.has(p.id))];
  const sampleMs = performance.now() - t;

  t = performance.now();
  const edges = knnEdges(drawn, 3).map((e) => ({ ...e, sharedMotivation: "", sharedSongs: 0, sharedArtists: 0 }));
  const edgeMs = performance.now() - t;

  const nodes: GalaxyNode[] = drawn.map((p) => ({ userId: p.id, name: p.name, cluster: p.cluster, topMotivations: [], isMe: p.id === "me", ...(sample?.slice.get(p.id) === "far" ? { far: true } : {}) }));

  t = performance.now();
  const layout = computeLayout(nodes, edges);
  const layoutMs = performance.now() - t;

  const shownOthers = drawn.slice(1);
  return {
    n,
    mode,
    nodes,
    edges,
    layout,
    hidden: n - drawn.length,
    hiddenBy: sample?.hidden,
    far: nodes.filter((x) => x.far).length,
    ms: { sample: sampleMs, edges: edgeMs, layout: layoutMs },
    payloadKb: JSON.stringify({ nodes, edges }).length / 1024,
    crowding: crowding(layout),
    clusters: new Set(shownOthers.map((p) => p.cluster)).size,
    meanSimilarity: shownOthers.reduce((a, p) => a + p.similarity, 0) / Math.max(1, shownOthers.length),
  };
}

/** Frames per second over the next `ms`, measured on the main thread. */
function measureFps(ms: number): Promise<number> {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = (now: number) => {
      frames++;
      if (now - start >= ms) resolve((frames * 1000) / (now - start));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export default function ScalePage() {
  // One state object: size and view change together, so a fast second click can't read the other one stale.
  const [cfg, setCfg] = useState<{ n: (typeof SIZES)[number]; mode: Mode }>({ n: 500, mode: "all" });
  const { n, mode } = cfg;
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cfgRef = useRef(cfg);
  const apiRef = useRef<GalaxyApi | null>(null);
  const extra = useMemo(() => [], []);

  const go = useCallback((size: number, m: Mode) => {
    setBusy(true);
    setFps(null);
    setSelectedId(null);
    // Let the "working" state paint before the synchronous build blocks the thread.
    setTimeout(() => {
      const r = build(size, m);
      setRun(r);
      setBusy(false);
      // The scene mounts on the next render; give it a moment to settle before sampling frame rate.
      setTimeout(() => measureFps(1500).then(setFps), 1200);
    }, 60);
  }, []);

  /** The ref is written synchronously, so back-to-back clicks each see the other's latest value. */
  const change = (patch: Partial<typeof cfg>) => {
    cfgRef.current = { ...cfgRef.current, ...patch };
    setCfg(cfgRef.current);
    go(cfgRef.current.n, cfgRef.current.mode);
  };

  useEffect(() => {
    const t = setTimeout(() => go(500, "all"), 0);
    return () => clearTimeout(t);
  }, [go]);

  const fpsTone = fps === null ? "" : fps >= 50 ? "text-emerald-300" : fps >= 30 ? "text-amber-300" : "text-red-300";
  const crowdTone = !run ? "" : run.crowding < 0.15 ? "text-emerald-300" : run.crowding < 0.4 ? "text-amber-300" : "text-red-300";

  return (
    <main className="relative flex min-h-0 flex-1 flex-col">
      <header className="relative z-10 flex flex-col gap-3 p-4 pt-5">
        <div className="flex items-center justify-between">
          <Link href="/sim" className="text-xs text-muted-foreground hover:text-foreground">
            Song Galaxy · scale test
          </Link>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-muted-foreground">Synthetic. Not real users.</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-muted-foreground">People</span>
          {SIZES.map((s) => (
            <button
              key={s}
              onClick={() => change({ n: s })}
              disabled={busy}
              className={cn("rounded-full px-2.5 py-1 text-[12px] tabular-nums", n === s ? "bg-primary text-primary-foreground" : "border border-white/10 hover:bg-white/5")}
            >
              {s.toLocaleString()}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] text-muted-foreground">View</span>
          {(["all", "bounded"] as const).map((m) => (
            <button
              key={m}
              onClick={() => change({ mode: m })}
              disabled={busy}
              className={cn("rounded-full px-2.5 py-1 text-[12px]", mode === m ? "bg-primary text-primary-foreground" : "border border-white/10 hover:bg-white/5")}
            >
              {m === "all" ? "Everyone (today)" : `Bounded (${DEFAULT_BUDGET})`}
            </button>
          ))}
        </div>

        {run ? (
          <dl className="grid grid-cols-4 gap-x-2 gap-y-2 text-center">
            <Stat label="Drawn" value={run.nodes.length.toLocaleString()} />
            <Stat label="Edges" value={run.edges.length.toLocaleString()} />
            <Stat label="Payload" value={`${run.payloadKb.toFixed(0)} KB`} />
            <Stat label="Hidden" value={run.hidden.toLocaleString()} />
            <Stat label="Layout" value={`${run.ms.layout.toFixed(0)} ms`} />
            <Stat label="Frame rate" value={fps === null ? "…" : `${fps.toFixed(0)} fps`} tone={fpsTone} />
            <Stat label="Crowded" value={`${Math.round(run.crowding * 100)}%`} tone={crowdTone} />
            <Stat label="Clusters" value={`${run.clusters}/5`} />
            <Stat label="Far stars" value={String(run.far)} />
          </dl>
        ) : null}
        {run ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Crowded = people with another person almost on top of them. Sampling {run.ms.sample.toFixed(0)} ms · edges {run.ms.edges.toFixed(0)} ms (server-side cost in the real thing) · mean closeness of who is drawn{" "}
            {run.meanSimilarity.toFixed(2)}.
          </p>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1 starfield">
        {busy || !run ? (
          <GalaxySkeleton label={busy ? `Building ${n.toLocaleString()} people…` : undefined} />
        ) : (
          <GalaxyScene
            key={`${run.n}-${run.mode}`}
            nodes={run.nodes}
            edges={run.edges}
            layout={run.layout}
            extra={extra}
            selectedId={selectedId}
            onSelect={setSelectedId}
            apiRef={apiRef}
            hidden={run.hiddenBy}
          />
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dd className={cn("font-serif text-lg tabular-nums leading-none", tone)}>{value}</dd>
      <dt className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
    </div>
  );
}
