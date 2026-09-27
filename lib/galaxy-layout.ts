import { forceLink, forceManyBody, forceSimulation, forceX, forceY, forceZ, type SimNode } from "d3-force-3d";
import { CLUSTER_IDS, type ClusterId } from "./clusters";
import { shapeSlot, SHAPE_SCALE } from "./constellation-shapes";
import type { GalaxyEdge, GalaxyNode } from "./types";
import { topTwo } from "./why-mix";

export type LayoutPoint = { id: string; x: number; y: number; z: number; cluster: string };
export type DestinationPoint = { id: string; x: number; y: number; z: number; radius: number };
/** `destinations`: distant community galaxies, home layout only. */
export type Layout = { points: Map<string, LayoutPoint>; radius: number; destinations?: Map<string, DestinationPoint> };

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

type Vec3 = { x: number; y: number; z: number };
const v_sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const v_add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const v_scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const v_len = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const v_dist = (a: Vec3, b: Vec3) => v_len(v_sub(a, b));
const v_norm = (a: Vec3): Vec3 => v_scale(a, 1 / (v_len(a) || 1));
const v_cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** Two unit directions perpendicular to `n` (and to each other), for laying a flat shape out around it. */
function perpAxes(n: Vec3): [Vec3, Vec3] {
  const dir = v_norm(n);
  const up: Vec3 = Math.abs(dir.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = v_norm(v_cross(dir, up));
  return [u, v_norm(v_cross(dir, u))];
}

/**
 * The offset (from a cluster's local center) of its constellation's slot `index`, oriented by
 * `facing` — a fixed direction per cluster, so the same shape always sits the same way up
 * regardless of which layout (real galaxy, home view) is placing it or how many members it has.
 */
function shapeOffsetFor(cluster: ClusterId, index: number, facing: Vec3): Vec3 {
  const [u, w] = perpAxes(facing);
  const slot = shapeSlot(cluster, index);
  return v_add(v_scale(u, slot.x * SHAPE_SCALE), v_scale(w, slot.y * SHAPE_SCALE));
}

/** Stable per-cluster ordering (by hash, not join time) so the same members always claim the same slots. */
function clusterSlotIndex(nodes: Pick<GalaxyNode, "userId" | "cluster">[]): Map<string, number> {
  const byCluster = new Map<string, typeof nodes>();
  for (const n of nodes) byCluster.set(n.cluster, [...(byCluster.get(n.cluster) ?? []), n]);
  const out = new Map<string, number>();
  for (const group of byCluster.values()) {
    [...group].sort((a, b) => hash(a.userId) - hash(b.userId)).forEach((n, i) => out.set(n.userId, i));
  }
  return out;
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
  const slotIndex = clusterSlotIndex(nodes);
  const simNodes: N[] = nodes.map((n) => {
    const a = nodeAnchor(n);
    // Everyone in a cluster fills a slot in its constellation (see lib/constellation-shapes.ts),
    // so the region resolves into that recognizable shape as it fills rather than growing shapeless.
    const facing = anchor(n.cluster);
    const offset = shapeOffsetFor(n.cluster as ClusterId, slotIndex.get(n.userId) ?? 0, facing);
    const ax = a.x + offset.x;
    const ay = a.y + offset.y;
    const az = a.z + offset.z;
    return { id: n.userId, cluster: n.cluster, ax, ay, az, x: ax + (rand() - 0.5) * 4, y: ay + (rand() - 0.5) * 4, z: az + (rand() - 0.5) * 4 };
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

const INNER_ORBIT = 4.5;
const OUTER_ORBIT = 9;
const NEARBY_RING = 13;
const DESTINATION_RADIUS = 6;

/** A star's fixed bearing around you. Per id, so moving to a closer orbit never swings anyone around. */
function bearing(id: string) {
  return ((hash(id) % 3600) / 3600) * Math.PI * 2;
}

/** Where a connected person sits: their bearing, at a radius set by how close the relationship is. */
export function homeOrbitPoint(node: Pick<GalaxyNode, "userId" | "cluster" | "orbit">): LayoutPoint {
  const a = bearing(node.userId);
  const r = OUTER_ORBIT + (INNER_ORBIT - OUTER_ORBIT) * clamp01(node.orbit ?? 0);
  // A slight tilt so the disc has depth when you turn it.
  return { id: node.userId, cluster: node.cluster, x: Math.cos(a) * r, y: Math.sin(a) * r, z: Math.sin(a * 2) * 1.5 };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The home galaxy: you at the center, connected people on orbits around you, suggestions faint
 * outside them, and community galaxies far off. Orbit radius is fixed by relationship (so "closer
 * to you" always means what it says), but a light force pass lets people who are connected to each
 * other drift together within their ring — the same constellation look computeLayout gives the
 * real galaxy, instead of everyone spaced evenly like spokes on a wheel.
 */
export function computeHomeLayout(nodes: GalaxyNode[], edges: GalaxyEdge[] = [], destinations: { id: string; distance: number }[] = []): Layout {
  const dests = new Map<string, DestinationPoint>();
  destinations.forEach((d, i) => {
    // Evenly round you, starting overhead; the canvas is a phone, so the ring is taller than wide.
    const a = Math.PI / 2 + (i / Math.max(1, destinations.length)) * Math.PI * 2 + 0.35;
    const r = 70 + clamp01(d.distance) * 30;
    dests.set(d.id, { id: d.id, x: Math.cos(a) * r * 0.7, y: Math.sin(a) * r, z: Math.sin(a * 3) * 6, radius: DESTINATION_RADIUS });
  });

  const points = new Map<string, LayoutPoint>();
  const homeNodes: (GalaxyNode & { anchor: { x: number; y: number; z: number } })[] = [];
  for (const n of nodes) {
    if (n.isMe) {
      points.set(n.userId, { id: n.userId, cluster: n.cluster, x: 0, y: 0, z: 0 });
    } else if (n.destinationId && dests.has(n.destinationId)) {
      // A community member: scattered through that galaxy's disc.
      const c = dests.get(n.destinationId)!;
      const rand = seeded(hash(n.userId));
      const a = rand() * Math.PI * 2;
      const r = 1.2 + Math.sqrt(rand()) * (c.radius - 1.5);
      points.set(n.userId, { id: n.userId, cluster: n.cluster, x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, z: c.z + (rand() - 0.5) * 3 });
    } else if (n.relationship === "nearby") {
      homeNodes.push({ ...n, anchor: { x: Math.cos(bearing(n.userId)) * NEARBY_RING, y: Math.sin(bearing(n.userId)) * NEARBY_RING, z: 0 } });
    } else {
      // Connected, and arriving stars with nowhere else to be, sit in orbit.
      const p = homeOrbitPoint(n);
      homeNodes.push({ ...n, anchor: p });
    }
  }

  if (homeNodes.length) {
    const key = homeNodes.map((n) => n.userId).join("|");
    const rand = seeded(hash(key));
    const simNodes: N[] = homeNodes.map((n) => ({
      id: n.userId,
      cluster: n.cluster,
      ax: n.anchor.x,
      ay: n.anchor.y,
      az: n.anchor.z,
      x: n.anchor.x + (rand() - 0.5) * 2,
      y: n.anchor.y + (rand() - 0.5) * 2,
      z: n.anchor.z,
    }));
    const ids = new Set(simNodes.map((n) => n.id));
    const links: L[] = edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.similarity > 0.3);
    forceSimulation<N>(simNodes, 3)
      .force(
        "link",
        forceLink<N, L>(links)
          .id((d) => d.id)
          .distance((l) => 1.5 + (1 - l.similarity) * 6)
          .strength((l) => 0.15 + l.similarity * l.similarity * 0.5),
      )
      .force("charge", forceManyBody<N>().strength(-6).distanceMax(9))
      // Strong pull to the anchor keeps "closer to you" meaningful even once friends cluster together.
      .force("x", forceX<N>((d) => d.ax).strength(0.22))
      .force("y", forceY<N>((d) => d.ay).strength(0.22))
      .force("z", forceZ<N>((d) => d.az).strength(0.35))
      .stop()
      .tick(200);
    for (const n of simNodes) points.set(n.id, { id: n.id, cluster: n.cluster, x: n.x!, y: n.y!, z: n.z! });
  }

  return { points, radius: NEARBY_RING + 3, destinations: dests };
}

// --- Constellation-growth placement (arrivals + songs) --------------------------------------
//
// A new star doesn't grow an open-ended branch off whoever it matched — it fills the next slot
// in its cluster's constellation (lib/constellation-shapes.ts), the same shape every member of
// that cluster is filling. So the region always has a specific, recognizable pattern it's
// building toward, and it gets more legible as it fills rather than sprawling indefinitely.

const MIN_CLEARANCE = 1.6;

/** New arrivals take the next unfilled slot in their cluster's constellation, without re-running the layout. */
export function placeArrival(layout: Layout, node: GalaxyNode, _edges: GalaxyEdge[], occupiedExtra: LayoutPoint[] = []): LayoutPoint {
  const cluster = node.cluster as ClusterId;
  const clusterPoints = [...layout.points.values(), ...occupiedExtra].filter((p) => p.cluster === node.cluster);

  // The shape's current center in *this* layout (real galaxy or home view — whichever placed it),
  // and its facing, which stays fixed per cluster so the same shape is always the same way up.
  const center = clusterPoints.length
    ? v_scale(clusterPoints.reduce((a, p) => v_add(a, p), { x: 0, y: 0, z: 0 }), 1 / clusterPoints.length)
    : anchor(cluster);
  const facing = anchor(cluster);
  const offset = shapeOffsetFor(cluster, clusterPoints.length, facing);

  const rand = seeded(hash(node.userId));
  const point = v_add(center, v_add(offset, { x: (rand() - 0.5) * 0.5, y: (rand() - 0.5) * 0.5, z: (rand() - 0.5) * 0.8 }));
  return { id: node.userId, cluster: node.cluster, x: point.x, y: point.y, z: point.z };
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
  const occupied: Vec3[] = [...all];
  const placed: LayoutPoint[] = [];
  for (const s of stars) {
    const ps = s.listenerIds.map((id) => people.get(id)).filter((p): p is LayoutPoint => !!p);
    const c = ps.length
      ? { x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length, z: ps.reduce((a, p) => a + p.z, 0) / ps.length }
      : mean;
    const dx = c.x - mean.x;
    const dy = c.y - mean.y;
    const dz = c.z - mean.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const dir = { x: dx / len, y: dy / len, z: dz / len };
    const rand = seeded(hash(s.id));
    const jitter = { x: (rand() - 0.5) * 4, y: (rand() - 0.5) * 4, z: (rand() - 0.5) * 4 };

    // Extend further out along the same listener-to-mean vector if the spot is crowded — moving a song
    // sideways (a new random direction) would sever the visual line to why it's placed there at all.
    let point = { x: 0, y: 0, z: 0 };
    for (const push of [2.2, 3.2, 4.2, 5.2, 6.2]) {
      point = { x: c.x + dir.x * push + jitter.x, y: c.y + dir.y * push + jitter.y, z: c.z + dir.z * push + jitter.z };
      if (!occupied.some((o) => v_dist(point, o) < MIN_CLEARANCE)) break;
    }

    occupied.push(point);
    placed.push({ id: `song:${s.id}`, cluster: s.cluster, x: point.x, y: point.y, z: point.z });
  }
  return placed;
}
