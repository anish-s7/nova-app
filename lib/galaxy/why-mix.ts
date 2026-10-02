import { CLUSTER_IDS, type ClusterId } from "./clusters";

/**
 * A listening profile over the five "whys": how much of someone's listening leans each way, summing
 * to 1. It is a label for where to put people on the galaxy and how to describe them, never an input
 * to matching (matching is per pick; see CLAUDE.md). Pure: no fetching, no mock imports.
 */
export type WhyMix = Record<ClusterId, number>;
export type PartialMix = Partial<Record<ClusterId, number>>;

/** Two whys closer than this (as shares of the mix) read as a blend, not a winner and a runner-up. */
export const BLEND_MARGIN = 0.08;

/** A why has to hold at least this share to count as someone's second why. */
export const SECOND_WHY_MIN = 0.15;

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Non-negative scores in, shares out. All zero is uniform: nothing leans anywhere, so everything is a blend. */
export function mixFromScores(scores: PartialMix): WhyMix {
  const total = CLUSTER_IDS.reduce((a, c) => a + Math.max(0, scores[c] ?? 0), 0);
  return Object.fromEntries(CLUSTER_IDS.map((c) => [c, total > 0 ? Math.max(0, scores[c] ?? 0) / total : 1 / CLUSTER_IDS.length])) as WhyMix;
}

/** The whys ranked by share, strongest first. Ties keep CLUSTER_IDS order; `classifyMix` is what decides a winner. */
export function rankWhys(mix: PartialMix): { id: ClusterId; w: number }[] {
  return CLUSTER_IDS.map((id) => ({ id, w: mix[id] ?? 0 })).sort((a, b) => b.w - a.w);
}

export type MixClass = {
  /** The why used for color, filters and short labels. */
  primary: ClusterId;
  /** The runner-up, when it holds a real share. */
  secondary: ClusterId | null;
  /** The top two are too close to call. Placement should sit between them. */
  blended: boolean;
};

/**
 * Picks the primary why. When the top two are within BLEND_MARGIN the person is `blended`, and the
 * primary is chosen by a hash of `seed` (their id) instead of by list order, so a run of near-ties
 * doesn't all fall to whichever cluster comes first in CLUSTER_IDS.
 */
export function classifyMix(mix: PartialMix, seed: string): MixClass {
  const [first, second] = rankWhys(mix);
  const blended = first.w - second.w < BLEND_MARGIN;
  const primary = blended && hashString(`${seed}:${first.id}:${second.id}`) % 2 === 1 ? second : first;
  const other = primary.id === first.id ? second : first;
  return { primary: primary.id, secondary: other.w >= SECOND_WHY_MIN ? other.id : null, blended };
}

/** The top two whys with their weights renormalized to sum to 1: where a person is placed and how a blend is drawn. */
export function topTwo(mix: PartialMix): { id: ClusterId; w: number }[] {
  const [a, b] = rankWhys(mix);
  if (b.w < SECOND_WHY_MIN || a.w + b.w <= 0) return [{ id: a.id, w: 1 }];
  const total = a.w + b.w;
  return [
    { id: a.id, w: a.w / total },
    { id: b.id, w: b.w / total },
  ];
}

/** Weight given to a why the song doesn't lean toward, so a person's own lean can still break a close call. */
const LEAN_FLOOR = 0.15;

/**
 * Why this person, specifically, has this song: the why where the song's own lean and the person's
 * lean overlap most. Two people can share a song for different reasons, and that is a bridge.
 */
export function listenerWhy(songWeights: PartialMix, personMix: PartialMix): ClusterId {
  let best: ClusterId = rankWhys(personMix)[0].id;
  let bestScore = -1;
  for (const c of CLUSTER_IDS) {
    const score = (songWeights[c] ?? 0) * (LEAN_FLOOR + (personMix[c] ?? 0));
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}
