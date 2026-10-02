import type { ClusterId } from "../galaxy/clusters";

/**
 * Feeling tags: how a song makes someone feel, in a shared vocabulary so two people who both feel
 * "homesick" in their (different) songs connect on exactly that. Four per listening reason
 * (lib/galaxy/clusters.ts), each with a rough spot on the mood circle, used only to put the likeliest
 * feelings first once the dot is placed (sortFeelings). Hardcoded, not a DB table, so the list can
 * change without a migration.
 */
export const FEELINGS = [
  // When it's too quiet at home
  { tag: "safe", why: "quiet_company", valence: 0.35, energy: -0.6 },
  { tag: "calm", why: "quiet_company", valence: 0.45, energy: -0.75 },
  { tag: "tender", why: "quiet_company", valence: 0.2, energy: -0.45 },
  { tag: "understood", why: "quiet_company", valence: 0.15, energy: -0.2 },
  // Songs for someone I miss
  { tag: "aching", why: "carrying_loss", valence: -0.7, energy: -0.3 },
  { tag: "heartbroken", why: "carrying_loss", valence: -0.85, energy: 0.1 },
  { tag: "longing", why: "carrying_loss", valence: -0.4, energy: -0.15 },
  { tag: "numb", why: "carrying_loss", valence: -0.5, energy: -0.75 },
  // Armor for hard days
  { tag: "defiant", why: "armor_up", valence: -0.15, energy: 0.8 },
  { tag: "fearless", why: "armor_up", valence: 0.4, energy: 0.8 },
  { tag: "alive", why: "armor_up", valence: 0.7, energy: 0.65 },
  { tag: "restless", why: "armor_up", valence: -0.25, energy: 0.45 },
  // When I need to disappear for a bit
  { tag: "weightless", why: "somewhere_else", valence: 0.5, energy: -0.3 },
  { tag: "free", why: "somewhere_else", valence: 0.7, energy: 0.3 },
  { tag: "euphoric", why: "somewhere_else", valence: 0.9, energy: 0.85 },
  { tag: "hopeful", why: "somewhere_else", valence: 0.6, energy: 0.05 },
  // Songs that take me back
  { tag: "nostalgic", why: "old_selves", valence: 0.1, energy: -0.1 },
  { tag: "bittersweet", why: "old_selves", valence: -0.15, energy: -0.25 },
  { tag: "homesick", why: "old_selves", valence: -0.4, energy: -0.45 },
  { tag: "young again", why: "old_selves", valence: 0.65, energy: 0.35 },
] as const satisfies readonly { tag: string; why: ClusterId; valence: number; energy: number }[];

/** The tags new picks choose from. */
export const TAGS = FEELINGS.map((f) => f.tag);

/**
 * The original situation/mood tags. Still valid (older picks carry them, the seed personas use
 * them), just no longer offered.
 */
export const LEGACY_TAGS = [
  "late night",
  "heartbreak",
  "hype / workout",
  "nostalgia",
  "focus / study",
  "celebration",
  "grief",
  "comfort",
  "road trip",
  "falling in love",
] as const;

export type FeelingTag = (typeof FEELINGS)[number]["tag"];
export type LegacyTag = (typeof LEGACY_TAGS)[number];
export type Tag = FeelingTag | LegacyTag;

/** Every tag the backend accepts: the feelings, plus the original ones for older picks. */
export const ALL_TAGS: readonly Tag[] = [...TAGS, ...LEGACY_TAGS];

export function isValidTag(value: string): value is Tag {
  return (ALL_TAGS as readonly string[]).includes(value);
}

export const MAX_PICK_TAGS = 3;

export type FeelingGroup = { why: ClusterId; feelings: FeelingTag[] };

/**
 * The feelings in five rows, one per listening reason. Once the mood-circle dot is placed, rows and
 * the feelings within them are ordered by how close each feeling sits to the dot, so the likeliest
 * come first; nothing is hidden. Unplaced: the list's own order.
 */
export function sortFeelings(mood: { valence: number; energy: number } | null): FeelingGroup[] {
  const distance = (f: (typeof FEELINGS)[number]) => (mood ? Math.hypot(f.valence - mood.valence, f.energy - mood.energy) : 0);
  const groups = new Map<ClusterId, (typeof FEELINGS)[number][]>();
  for (const f of FEELINGS) groups.set(f.why, [...(groups.get(f.why) ?? []), f]);
  return [...groups]
    .map(([why, list]) => ({ why, list: mood ? [...list].sort((a, b) => distance(a) - distance(b)) : list }))
    .sort((a, b) => (mood ? distance(a.list[0]) - distance(b.list[0]) : 0))
    .map(({ why, list }) => ({ why, feelings: list.map((f) => f.tag) }));
}
