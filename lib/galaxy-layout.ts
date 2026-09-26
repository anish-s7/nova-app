import { forceLink, forceManyBody, forceSimulation, forceX, forceY, forceZ, type SimNode } from "d3-force-3d";
import { CLUSTER_IDS } from "./clusters";
import type { GalaxyEdge, GalaxyNode } from "./types";
import { topTwo } from "./why-mix";

export type LayoutPoint = { id: string; x: number; y: number; z: number; cluster: string };
export type Layout = { points: Map<string, LayoutPoint>; radius: number };

type N = SimNode & { cluster: string; ax: number; ay: number; az: number };
type L = { source: string | N; target: string | N; similarity: number };

const TARGET_RADIUS = 22;

function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function anchor(cluster: string) {
  const i = Math.max(0, CLUSTER_IDS.indexOf(cluster as (typeof CLUSTER_IDS)[number]));
  const a = (i / CLUSTER_IDS.length) * Math.PI * 2 - Math.PI / 2;
  // Clusters sit at different depths so the galaxy has a body when you orbit it, not a flat disc.
  return { x: Math.cos(a) * 30, y: Math.sin(a) * 30, z: Math.sin(a * 2 + 0.6) * 14 };
}

/**
 * Where a person is pulled to: the weighted center of their top two whys, so someone split between
 * two regions settles between them. Only two, because the anchors sit on a ring and averaging all
 * five would drag everyone to the middle and collapse the regions. With no mix it is the cluster's anchor.
 */
function nodeAnchor(n: Pick<GalaxyNode, "cluster" | "whys">) {
  if (!n.whys) return anchor(n.cluster);
  const top = topTwo(n.whys);
  const p = { x: 0, y: 0, z: 0 };
  for (const { id, w } of top) {
    const a = anchor(id);
    p.x += a.x * w;
    p.y += a.y * w;
    p.z += a.z * w;
  }
  return p;
}

const whysKey = (n: GalaxyNode) =>
  n.whys
    ? topTwo(n.whys)
        .map((t) => `${t.id}${t.w.toFixed(2)}`)
        .join("+")
    : "";

const cache = new Map<string, Layout>();

export function layoutKey(nodes: GalaxyNode[], edges: GalaxyEdge[]) {
  return `${nodes.map((n) => `${n.userId}:${n.cluster}${n.whys ? `:${whysKey(n)}` : ""}`).join("|")}#${edges.map((e) => `${e.source}-${e.target}-${e.similarity.toFixed(2)}`).join("|")}`;
}

/**
 * Similarity edges in, 3D positions out. Runs a fixed 300 ticks synchronously and freezes;
 * there is no continuous physics. Results are cached by data so every screen shares one layout.
 */
export function computeLayout(nodes: GalaxyNode[], edges: GalaxyEdge[]): Layout {
  const key = layoutKey(nodes, edges);
  const hit = cache.get(key);
  if (hit) return hit;

  const rand = seeded(hash(key));
  const simNodes: N[] = nodes.map((n) => {
    const a = nodeAnchor(n);
    return { id: n.userId, cluster: n.cluster, ax: a.x, ay: a.y, az: a.z, x: a.x + (rand() - 0.5) * 16, y: a.y + (rand() - 0.5) * 16, z: a.z + (rand() - 0.5) * 16 };
  });
  const ids = new Set(simNodes.map((n) => n.id));
  const links: L[] = edges
    .filter((e) => ids.has(e.source) && ids.has(e.target) && e.similarity > 0.3)
    .map((e) => ({ source: e.source, target: e.target, similarity: e.similarity }));

  forceSimulation<N>(simNodes, 3)
    .force(
      "link",
      forceLink<N, L>(links)
        .id((d) => d.id)
        .distance((l) => 3 + (1 - l.similarity) * 34)
        .strength((l) => 0.08 + l.similarity * l.similarity * 0.7),
    )
    .force("charge", forceManyBody<N>().strength(-22).distanceMax(45))
    .force("x", forceX<N>((d) => d.ax).strength(0.05))
    .force("y", forceY<N>((d) => d.ay).strength(0.05))
    .force("z", forceZ<N>((d) => d.az).strength(0.05))
    .stop()
    .tick(300);

  const me = nodes.find((n) => n.isMe);
  const origin = simNodes.find((n) => n.id === me?.userId) ?? { x: 0, y: 0, z: 0 };
  let maxR = 1;
  for (const n of simNodes) {
    n.x = n.x! - origin.x!;
    n.y = n.y! - origin.y!;
    n.z = n.z! - origin.z!;
    maxR = Math.max(maxR, Math.hypot(n.x, n.y));
  }
  const k = TARGET_RADIUS / maxR;
  const points = new Map<string, LayoutPoint>();
  for (const n of simNodes) points.set(n.id, { id: n.id, cluster: n.cluster, x: n.x! * k, y: n.y! * k, z: n.z! * k });

  const layout = { points, radius: TARGET_RADIUS };
  cache.set(key, layout);
  return layout;
}

/** New arrivals are placed next to their most similar neighbor without re-running the layout. */
export function placeArrival(layout: Layout, node: GalaxyNode, edges: GalaxyEdge[]): LayoutPoint {
  const best = [...edges]
    .sort((a, b) => b.similarity - a.similarity)
    .map((e) => layout.points.get(e.source === node.userId ? e.target : e.source))
    .find(Boolean);
  const base = best ?? { x: 0, y: 0, z: 0 };
  const a = (hash(node.userId) % 360) * (Math.PI / 180);
  return { id: node.userId, cluster: node.cluster, x: base.x + Math.cos(a) * 2.6, y: base.y + Math.sin(a) * 2.6, z: base.z + 0.5 };
}

/**
 * Song stars sit at the middle of the people who share them, nudged outward so they float
 * around the people layer instead of hiding inside it. A song shared across two "whys" lands
 * between them, which is what makes the bridges visible.
 */
export function placeSongs(layout: Layout, stars: { id: string; cluster: string; listenerIds: string[] }[], extra: LayoutPoint[] = []): LayoutPoint[] {
  const people = new Map(layout.points);
  for (const p of extra) people.set(p.id, p);
  const all = [...people.values()];
  const mean = {
    x: all.reduce((a, p) => a + p.x, 0) / Math.max(1, all.length),
    y: all.reduce((a, p) => a + p.y, 0) / Math.max(1, all.length),
    z: all.reduce((a, p) => a + p.z, 0) / Math.max(1, all.length),
  };
  return stars.map((s) => {
    const ps = s.listenerIds.map((id) => people.get(id)).filter((p): p is LayoutPoint => !!p);
    const c = ps.length
      ? { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length }
      : mean;
    const dx = c.x - mean.x;
    const dy = c.y - mean.y;
    const dz = c.z - mean.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const rand = seeded(hash(s.id));
    const push = 2.2;
    return {
      id: `song:${s.id}`,
      cluster: s.cluster,
      x: c.x + (dx / len) * push + (rand() - 0.5) * 4,
      y: c.y + (dy / len) * push + (rand() - 0.5) * 4,
      z: c.z + (dz / len) * push + (rand() - 0.5) * 4,
    };
  });
}
