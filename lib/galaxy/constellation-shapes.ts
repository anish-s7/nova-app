/**
 * Each cluster's region grows toward a specific, recognizable point-ring shape instead of
 * sprawling into an unlabeled blob — the same idea as hand-drawn asterisms, but generated
 * procedurally so it works for any cluster id, including ones discovered later by the topic-
 * cluster recompute job (scripts/recompute-topic-clusters.ts), not just five fixed, hand-authored
 * ones. Trade-off: this loses the "real constellation" flavor (Lyra, Orion, ...) that the old
 * hand-drawn shapes had; what's kept is the part that actually matters for the layout — a stable,
 * deterministic outline that gets more legible as a cluster fills.
 *
 * Deterministic per cluster id: same id always produces the same shape, with no dependency on
 * how many clusters exist or in what order they were loaded (unlike an array keyed by a fixed
 * ClusterId union, which can't represent a cluster discovered at runtime).
 */

const POINTS_PER_SHAPE = 6;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shapeCache = new Map<string, { x: number; y: number }[]>();

/**
 * A cluster's point-ring shape: `POINTS_PER_SHAPE` points scattered at varying radius, sorted by
 * angle so tracing them in order draws a legible, non-self-intersecting loop (the same visual
 * quality a hand-drawn asterism has) rather than a scatter. Seeded by the cluster id, so it's
 * stable across sessions and reproducible without being hand-designed. Memoized since layout
 * placement calls this once per member, every render.
 */
function shapeFor(clusterId: string): { x: number; y: number }[] {
  const cached = shapeCache.get(clusterId);
  if (cached) return cached;
  const rand = seeded(hashString(clusterId));
  const shape = Array.from({ length: POINTS_PER_SHAPE }, () => {
    const angle = rand() * Math.PI * 2;
    const radius = 0.35 + rand() * 0.65;
    return { angle, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  })
    .sort((a, b) => a.angle - b.angle)
    .map(({ x, y }) => ({ x, y }));
  shapeCache.set(clusterId, shape);
  return shape;
}

/** Local footprint size (same units as the rest of the layout, e.g. `idealDistance`'s range). */
export const SHAPE_SCALE = 6;

/**
 * The slot a cluster fills at `index`, looping onto a bigger self-similar copy of the same
 * shape once every slot is taken — still that cluster's shape, just retraced at a larger scale
 * for the next ring of arrivals, instead of drifting into an unrelated blob.
 */
export function shapeSlot(clusterId: string, index: number): { x: number; y: number } {
  const shape = shapeFor(clusterId);
  const n = shape.length;
  const ring = Math.floor(index / n);
  const p = shape[index % n];
  const scale = 1 + ring * 0.6;
  return { x: p.x * scale, y: p.y * scale };
}
