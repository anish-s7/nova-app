import { CLUSTER_IDS, type ClusterId } from "./clusters";
import { FEELINGS, type FeelingTag, type Tag } from "./tags";
import { classifyMix, mixFromScores, type MixClass, type WhyMix } from "./why-mix";

/**
 * Which "why" a profile belongs to, from the picks they've made. Deterministic and free: no LLM,
 * no embeddings. The result is only a label for grouping people on the galaxy
 * (profiles.primary_cluster); it is never used for matching, and it is a vote across picks, not a
 * profile-level vector (see CLAUDE.md).
 */

type Weights = Partial<Record<ClusterId, number>>;

/**
 * How each tag (lib/tags.ts) leans across the five "whys". A feeling counts fully toward its own
 * reason; the original tags keep the spread they always had, so older picks cluster as before.
 */
export const TAG_WEIGHTS: Record<Tag, Weights> = {
  ...(Object.fromEntries(FEELINGS.map((f) => [f.tag, { [f.why]: 1 }])) as Record<FeelingTag, Weights>),
  "late night": { quiet_company: 1, carrying_loss: 0.4 },
  heartbreak: { carrying_loss: 1, old_selves: 0.4, quiet_company: 0.3 },
  "hype / workout": { armor_up: 1 },
  nostalgia: { old_selves: 1, carrying_loss: 0.3 },
  "focus / study": { quiet_company: 0.5, somewhere_else: 0.4, armor_up: 0.3 },
  celebration: { armor_up: 0.5, old_selves: 0.5 },
  grief: { carrying_loss: 1 },
  comfort: { quiet_company: 0.8, carrying_loss: 0.3 },
  "road trip": { somewhere_else: 1, old_selves: 0.3 },
  "falling in love": { somewhere_else: 0.7, quiet_company: 0.3 },
};

/** How much valence/energy can move a pick, next to a tag's weight of up to 1. Tags lead; the slider breaks ties. */
const EMOTION = 0.4;

export type PickForCluster = { tags: string[]; valence: number; energy: number };

/** One pick's lean across the clusters. */
export function scorePick(pick: PickForCluster): Record<ClusterId, number> {
  const s = Object.fromEntries(CLUSTER_IDS.map((c) => [c, 0])) as Record<ClusterId, number>;
  for (const tag of pick.tags) for (const [c, w] of Object.entries(TAG_WEIGHTS[tag as Tag] ?? {})) s[c as ClusterId] += w;
  // Quiet and low read as company in the quiet; sad reads as loss; intense reads as armor; bright reads as escape.
  s.quiet_company += Math.max(0, -pick.energy) * EMOTION;
  s.carrying_loss += Math.max(0, -pick.valence) * EMOTION;
  s.armor_up += Math.max(0, pick.energy) * EMOTION;
  s.somewhere_else += Math.max(0, pick.valence) * EMOTION;
  return s;
}

/** A profile's listening profile: each pick's lean summed across the five whys, as shares that sum to 1. Null with no picks. */
export function whyMixFor(picks: PickForCluster[]): WhyMix | null {
  if (!picks.length) return null;
  const total = Object.fromEntries(CLUSTER_IDS.map((c) => [c, 0])) as Record<ClusterId, number>;
  for (const p of picks) {
    const s = scorePick(p);
    for (const c of CLUSTER_IDS) total[c] += s[c];
  }
  return mixFromScores(total);
}

/** The mix plus its primary/secondary/blended reading, or null with no picks. `seed` (the profile id) breaks near-ties without favoring list order. */
export function classifyPicks(picks: PickForCluster[], seed: string): (MixClass & { mix: WhyMix }) | null {
  const mix = whyMixFor(picks);
  return mix ? { mix, ...classifyMix(mix, seed) } : null;
}

/** The cluster a profile leans toward overall, or null with no picks. Near-ties are broken by `seed`, not by CLUSTER_IDS order. */
export function primaryClusterFor(picks: PickForCluster[], seed = ""): ClusterId | null {
  return classifyPicks(picks, seed)?.primary ?? null;
}

/** Why one pick was made: the why it leans hardest toward. Used to say why someone has a song, not who they are overall. */
export function pickWhy(pick: PickForCluster, seed = ""): ClusterId {
  return classifyMix(mixFromScores(scorePick(pick)), seed).primary;
}
