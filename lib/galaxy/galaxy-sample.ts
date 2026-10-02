/**
 * Bounded galaxy sampling: which people the front page draws. The galaxy is a viewport onto
 * your neighborhood, never a map of everyone. Pure and deterministic so the same sampler runs
 * in the mock, the scale test (app/sim/scale) and, later, the server-side window.
 *
 * Slices, in order: you, your strongest global matches, a couple of ambient "far" stars, a newcomer
 * set, then a diversity-ranked near set. The rest isn't drawn; it comes back as per-cluster counts,
 * and `expandOrder` ranks a cluster's remaining people for "more here" paging.
 */

export type SampleCandidate = {
  id: string;
  cluster: string;
  /** Taste vector, only used to keep the near set from being 200 near-duplicates. */
  vector: number[];
  /** Similarity to the viewer, 0..1. */
  similarity: number;
  joinedDaysAgo: number;
  /**
   * 0..1: how strong a thread this person has with the viewer despite being far away (e.g. one
   * shared song felt differently). Feeds the ambient far stars. Absent means none.
   */
  bridge?: number;
};

export type SampleOptions = {
  /** Total nodes drawn, viewer included. */
  budget?: number;
  /** Always-shown strongest matches, whatever cluster is focused. */
  topMatches?: number;
  /** Share of the remaining budget reserved for people who joined recently. */
  newcomerShare?: number;
  /** A person counts as new for this many days. */
  newcomerDays?: number;
  /** 1 = pure closeness, 0 = pure spread. */
  relevance?: number;
  /** Dim, ignorable stars at the edge for people far from you who share a strong thread. */
  farStars?: number;
  /** A far star must be less similar than this. */
  farBelow?: number;
  /** Viewer + day. Same seed, same sample, so reloads don't reshuffle. */
  seed: string;
};

export type Slice = "match" | "near" | "fresh" | "far";

export type Sample = {
  ids: string[];
  slice: Map<string, Slice>;
  /** Everyone not drawn. */
  hidden: { total: number; byCluster: Record<string, number> };
  sampled: boolean;
};

export const DEFAULT_BUDGET = 200;
/** Candidates the diversity pass considers. Bounds the work at O(pool x budget) however big the population is. */
const POOL = 600;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const norm = (v: number[]) => Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;

export function cosine(a: number[], b: number[], na = norm(a), nb = norm(b)) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d / (na * nb);
}

/**
 * Greedy maximal-marginal-relevance: repeatedly take the pool member that is close to the viewer
 * but least like anyone already chosen. `seen` starts as what's already drawn and grows as picks
 * are made. Returns pool members in pick order.
 */
function mmr(pool: SampleCandidate[], seen: SampleCandidate[], count: number, lambda: number): SampleCandidate[] {
  const norms = new Map(pool.map((c) => [c.id, norm(c.vector)]));
  const seenNorms = seen.map((c) => norm(c.vector));
  const maxSeen = pool.map((c) => {
    let m = 0;
    seen.forEach((s, i) => (m = Math.max(m, cosine(c.vector, s.vector, norms.get(c.id), seenNorms[i]))));
    return m;
  });
  const alive = pool.map(() => true);
  const out: SampleCandidate[] = [];
  while (out.length < count) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      if (!alive[i]) continue;
      const score = lambda * pool[i].similarity - (1 - lambda) * maxSeen[i];
      if (score > bestScore) [best, bestScore] = [i, score];
    }
    if (best < 0) break;
    const p = pool[best];
    alive[best] = false;
    out.push(p);
    for (let i = 0; i < pool.length; i++) if (alive[i]) maxSeen[i] = Math.max(maxSeen[i], cosine(pool[i].vector, p.vector, norms.get(pool[i].id), norms.get(p.id)));
  }
  return out;
}

export function sampleGalaxy(candidates: SampleCandidate[], opts: SampleOptions): Sample {
  const budget = Math.max(1, opts.budget ?? DEFAULT_BUDGET);
  const room = budget - 1; // the viewer takes one
  const slice = new Map<string, Slice>();

  const finish = (ids: string[]): Sample => {
    const chosen = new Set(ids);
    const byCluster: Record<string, number> = {};
    let total = 0;
    for (const c of candidates) {
      if (chosen.has(c.id)) continue;
      total++;
      byCluster[c.cluster] = (byCluster[c.cluster] ?? 0) + 1;
    }
    return { ids, slice, hidden: { total, byCluster }, sampled: total > 0 };
  };

  if (candidates.length <= room) {
    for (const c of candidates) slice.set(c.id, "near");
    return finish(candidates.map((c) => c.id));
  }

  const rand = rng(hash(opts.seed));
  const chosen = new Set<string>();
  const pick = (c: SampleCandidate, s: Slice) => {
    chosen.add(c.id);
    slice.set(c.id, s);
  };

  // 1. Strongest matches, anywhere in the galaxy.
  const bySimilarity = [...candidates].sort((a, b) => b.similarity - a.similarity);
  for (const c of bySimilarity.slice(0, Math.min(opts.topMatches ?? 12, room))) pick(c, "match");

  // 2. Ambient far stars: distant, but with a strong thread to you. Few, dim, easy to ignore.
  const farBelow = opts.farBelow ?? 0.55;
  const far = candidates
    .filter((c) => !chosen.has(c.id) && (c.bridge ?? 0) > 0 && c.similarity < farBelow)
    .sort((a, b) => (b.bridge ?? 0) - (a.bridge ?? 0));
  for (const c of far.slice(0, Math.min(opts.farStars ?? 2, room - chosen.size))) pick(c, "far");

  // 3. Newcomers, so early users are seen and the near set doesn't rich-get-richer.
  const left = room - chosen.size;
  const newcomerDays = opts.newcomerDays ?? 14;
  const fresh = candidates
    .filter((c) => !chosen.has(c.id) && c.joinedDaysAgo <= newcomerDays)
    // Weighted shuffle: newer people are likelier to rise, but not always the same ones.
    .map((c) => ({ c, k: -Math.log(rand() || 1e-9) / (1 + (newcomerDays - c.joinedDaysAgo) / newcomerDays) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.c);
  for (const c of fresh.slice(0, Math.round(left * (opts.newcomerShare ?? 0.25)))) pick(c, "fresh");

  // 4. Near set: closest people, but each pick must also be different from what's already shown.
  const pool = bySimilarity.filter((c) => !chosen.has(c.id)).slice(0, POOL);
  for (const c of mmr(pool, candidates.filter((c) => chosen.has(c.id)), room - chosen.size, opts.relevance ?? 0.65)) pick(c, "near");

  return finish([...chosen]);
}

/**
 * "More here": everyone in `cluster` who isn't drawn yet, in the order to reveal them (closest and
 * most different from what's shown first). Page through it with slice(have, have + step). Ranks at
 * most POOL people; past that the cluster has more than a screen can honestly hold.
 */
export function expandOrder(candidates: SampleCandidate[], drawnIds: ReadonlySet<string>, cluster: string): SampleCandidate[] {
  const pool = candidates
    .filter((c) => c.cluster === cluster && !drawnIds.has(c.id))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, POOL);
  return mmr(pool, candidates.filter((c) => drawnIds.has(c.id) && c.cluster === cluster), pool.length, 0.65);
}

/** Each point's `k` most similar others, deduplicated into undirected edges. O(n^2): fine for a sampled set, not for the whole population. */
export function knnEdges(points: { id: string; vector: number[] }[], k: number, min = 0.66) {
  const norms = points.map((p) => norm(p.vector));
  const links = new Map<string, { source: string; target: string; similarity: number }>();
  for (let i = 0; i < points.length; i++) {
    const scored: [number, number][] = [];
    for (let j = 0; j < points.length; j++) if (i !== j) scored.push([j, cosine(points[i].vector, points[j].vector, norms[i], norms[j])]);
    scored.sort((a, b) => b[1] - a[1]);
    for (const [j, s] of scored.slice(0, k)) {
      if (s < min) continue;
      const [a, b] = points[i].id < points[j].id ? [points[i].id, points[j].id] : [points[j].id, points[i].id];
      links.set(`${a}|${b}`, { source: a, target: b, similarity: s });
    }
  }
  return [...links.values()];
}
