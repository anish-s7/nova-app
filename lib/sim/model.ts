import { CLUSTER_IDS, type ClusterId } from "@/lib/clusters";
import { clampEmotionValue } from "@/lib/emotion";
import { SONG_CATALOG, SONG_CONTEXT } from "@/lib/music-context";
import { TAGS } from "@/lib/tags";
import type { Song } from "@/lib/types";
import data from "./song-vectors.json";

/**
 * What the /sim demo knows about people and songs. Songs are the mock catalog, with real
 * gemini-embedding-001 vectors baked in by scripts/build-sim-embeddings.ts. People are synthetic:
 * blended tastes turned into a handful of picks, each with tags and a valence/energy point,
 * which is the same shape a real pick has (see CLAUDE.md, "How matching works").
 */

const idIndex = new Map(data.ids.map((id, i) => [id, i]));
export const SONGS: Song[] = data.ids.map((id) => SONG_CATALOG.find((s) => s.id === id)!);
const N = SONGS.length;

/** Cosine similarity of every song pair, from the real embeddings (vectors are unit length). */
const CONTENT = new Float32Array(N * N);
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) CONTENT[i * N + j] = data.vectors[i].reduce((s, x, d) => s + x * data.vectors[j][d], 0);

const AFFINITY = SONGS.map((s) => CLUSTER_IDS.map((c) => SONG_CONTEXT[s.id]?.clusters[c] ?? 0));

// Rough mood of a song, from how the catalog says it's used. A listener's own feel is this plus noise.
const CLUSTER_MOOD: Record<ClusterId, [number, number]> = {
  quiet_company: [-0.05, -0.35],
  armor_up: [0.2, 0.75],
  carrying_loss: [-0.6, -0.3],
  somewhere_else: [0.1, -0.1],
  old_selves: [0.35, 0.15],
};
const SONG_MOOD: [number, number][] = SONGS.map((s, i) => {
  const ctx = SONG_CONTEXT[s.id];
  const w = AFFINITY[i];
  const tot = w.reduce((a, b) => a + b, 0) || 1;
  let v = 0;
  let e = 0;
  CLUSTER_IDS.forEach((c, k) => {
    v += (w[k] / tot) * CLUSTER_MOOD[c][0];
    e += (w[k] / tot) * CLUSTER_MOOD[c][1];
  });
  return ctx?.mode === "lift" ? [v + 0.25, e + 0.3] : [v, e];
});

const CLUSTER_TAGS: Record<ClusterId, string[]> = {
  quiet_company: ["late night", "comfort", "focus / study"],
  armor_up: ["hype / workout", "focus / study", "celebration"],
  carrying_loss: ["grief", "heartbreak", "nostalgia"],
  somewhere_else: ["road trip", "comfort", "focus / study"],
  old_selves: ["nostalgia", "celebration", "falling in love"],
};
const tagBit = (t: string) => 1 << TAGS.indexOf(t as (typeof TAGS)[number]);

export type Pick = { song: number; tags: number; valence: number; energy: number };
export type SimUser = { id: string; name: string; taste: number[]; picks: Pick[]; bornAt: number };

export const FEATURES = ["Song content", "Mood (valence/energy)", "Shared tags", "Same taste group"] as const;

const QUIRK = 0.2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const popcount = (x: number) => {
  let c = 0;
  for (; x; x &= x - 1) c++;
  return c;
};

function pickFrom(rand: () => number, weights: number[]) {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) <= 0) return i;
  return weights.length - 1;
}

/** One pick for someone with this taste blend. `song` forces a specific song (a viral one). */
export function makePick(rand: () => number, taste: number[], song?: number): Pick {
  const cluster = pickFrom(rand, taste);
  // Mostly songs that fit the taste; now and then something that fits nobody's pattern.
  const s = song ?? (rand() < QUIRK ? Math.floor(rand() * N) : pickFrom(rand, AFFINITY.map((a) => a[cluster] ** 2 + 0.01)));
  const pool = [...CLUSTER_TAGS[CLUSTER_IDS[cluster]]].sort(() => rand() - 0.5);
  let tags = 0;
  for (const t of pool.slice(0, 1 + Math.floor(rand() * 3))) tags |= tagBit(t);
  if (rand() < 0.15) tags |= 1 << Math.floor(rand() * TAGS.length);
  return {
    song: s,
    tags,
    valence: clampEmotionValue(SONG_MOOD[s][0] + (rand() - 0.5) * 0.7),
    energy: clampEmotionValue(SONG_MOOD[s][1] + (rand() - 0.5) * 0.7),
  };
}

export function randomSong(rand: () => number, cluster: number) {
  return pickFrom(rand, AFFINITY.map((a) => a[cluster] ** 2 + 0.01));
}

export const dominant = (u: SimUser) => u.taste.reduce((bi, x, i, a) => (x > a[bi] ? i : bi), 0);

export type PairMatch = { f: number[]; a: number; b: number; /** Set by realFormulaMatch: the cosine of the closest pick pair. */ score?: number };

/**
 * How two people fit, judged per pick like the real matcher (never averaged into a profile):
 * find their best pair of picks, then read four signals off it. The default weighting below is
 * what draws the graph; the learner in learner.ts tries to find better ones.
 */
/** The four signals for one pair of picks. `sameGroup` is a property of the two people, not the picks. */
function pairFeatures(p: Pick, q: Pick, sameGroup: number): number[] {
  const content = clamp01((CONTENT[p.song * N + q.song] + 0.1) / 0.8);
  const mood = clamp01(1 - Math.hypot(p.valence - q.valence, p.energy - q.energy) / 1.4);
  const union = p.tags | q.tags;
  const tags = union ? popcount(p.tags & q.tags) / popcount(union) : 0;
  return [content, mood, tags, sameGroup];
}

export function pairMatch(a: SimUser, b: SimUser): PairMatch {
  const group = dominant(a) === dominant(b) ? 1 : 0;
  let best = -Infinity;
  let out: PairMatch = { f: [0, 0, 0, group], a: 0, b: 0 };
  for (const p of a.picks) {
    for (const q of b.picks) {
      const f = pairFeatures(p, q, group);
      const score = f[0] + 0.6 * f[1] + 0.6 * f[2];
      if (score > best) [best, out] = [score, { f, a: p.song, b: q.song }];
    }
  }
  return out;
}

/**
 * The production formula, tried inside the simulated world. Each pick becomes the vector
 * [song embedding, EMOTION_WEIGHT x (valence, energy)] and two people are as close as their
 * closest pair of picks are by cosine, which is what the pgvector search over picks does
 * (see lib/emotion.ts and db/contract.md). The sim's embeddings are 128-d and centered, the
 * production ones are 768-d, so the shape of the trade-off carries over and the exact number does not.
 */
export function realFormulaMatch(a: SimUser, b: SimUser, weight: number): PairMatch {
  const group = dominant(a) === dominant(b) ? 1 : 0;
  const w2 = weight * weight;
  let best = -Infinity;
  let out: PairMatch = { f: [0, 0, 0, group], a: 0, b: 0 };
  for (const p of a.picks) {
    const np = 1 + w2 * (p.valence ** 2 + p.energy ** 2);
    for (const q of b.picks) {
      const nq = 1 + w2 * (q.valence ** 2 + q.energy ** 2);
      const cos = (CONTENT[p.song * N + q.song] + w2 * (p.valence * q.valence + p.energy * q.energy)) / Math.sqrt(np * nq);
      if (cos > best) [best, out] = [cos, { f: pairFeatures(p, q, group), a: p.song, b: q.song, score: cos }];
    }
  }
  return out;
}

/** The fixed, hand-set similarity that draws the graph: 0..1. */
export const defaultSim = (f: number[]) => (f[0] + 0.6 * f[1] + 0.6 * f[2] + 0.4 * f[3]) / 2.6;

export const songLabel = (i: number) => `“${SONGS[i].title}”`;
export const songIndex = (id: string) => idIndex.get(id);
