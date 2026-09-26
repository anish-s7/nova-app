import { CLUSTER_IDS, type ClusterId } from "./clusters";
import type { Tag } from "./tags";

/**
 * Which "why" a profile belongs to, from the picks they've made. Deterministic and free: no LLM,
 * no embeddings. The result is only a label for grouping people on the galaxy
 * (profiles.primary_cluster); it is never used for matching, and it is a vote across picks, not a
 * profile-level vector (see CLAUDE.md).
 */

type Weights = Partial<Record<ClusterId, number>>;

/** How each mood tag (lib/tags.ts) leans across the five "whys". */
export const TAG_WEIGHTS: Record<Tag, Weights> = {
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

/** The cluster a profile leans toward overall, or null with no picks. Ties go to the earlier cluster in CLUSTER_IDS, so it is stable. */
export function primaryClusterFor(picks: PickForCluster[]): ClusterId | null {
  if (!picks.length) return null;
  const total = Object.fromEntries(CLUSTER_IDS.map((c) => [c, 0])) as Record<ClusterId, number>;
  for (const p of picks) for (const c of CLUSTER_IDS) total[c] += scorePick(p)[c];
  return CLUSTER_IDS.reduce((best, c) => (total[c] > total[best] ? c : best), CLUSTER_IDS[0]);
}
