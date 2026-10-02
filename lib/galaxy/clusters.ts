import type { ContextTag } from "../data/types";

export type ClusterId = "quiet_company" | "armor_up" | "carrying_loss" | "somewhere_else" | "old_selves";

export type Cluster = {
  /** Not narrowed to `ClusterId`: real clusters are discovered at runtime with ids this module never hard-codes. */
  id: string;
  /** Canonical motivation label shared across users in this cluster. */
  label: string;
  short: string;
  description: string;
  /** Hex for three.js; mirrored in CSS as --cluster-<id>. */
  color: string;
};

export const CLUSTERS: Record<ClusterId, Cluster> = {
  quiet_company: {
    id: "quiet_company",
    label: "Quiet & Solitude",
    short: "Solitude",
    description: "You put something on so the room isn't silent, usually late and usually alone.",
    color: "#c9a66b",
  },
  armor_up: {
    id: "armor_up",
    label: "Motivation & Focus",
    short: "Motivation",
    description: "What you play before something challenging or when you need energy.",
    color: "#7fa9a3",
  },
  carrying_loss: {
    id: "carrying_loss",
    label: "Comfort & Longing",
    short: "Comfort",
    description: "You go back to songs tied to a person, a place, or a time that's gone.",
    color: "#9a8fbf",
  },
  somewhere_else: {
    id: "somewhere_else",
    label: "Escaping & Zoning Out",
    short: "Zoning Out",
    description: "Headphones in, taking a break from everything else.",
    color: "#c48e96",
  },
  old_selves: {
    id: "old_selves",
    label: "Nostalgia & Memories",
    short: "Nostalgia",
    description: "One song and you're in a specific year again.",
    color: "#9db084",
  },
};

export const CLUSTER_IDS = Object.keys(CLUSTERS) as ClusterId[];

/**
 * Not a real cluster: `galaxy_pool`/`galaxy_cluster_counts` (supabase/migrations/
 * 20260927010000_galaxy_window.sql) coalesce a profile with no `primary_cluster` yet to the literal
 * id `"unassigned"`. It needs its own entry so `getCluster` doesn't silently alias it to
 * `quiet_company` — which used to make two genuinely different groups (real quiet_company members,
 * and people nothing has been computed for yet) render as the same "Too quiet" chip twice in
 * `ClusterFilter`.
 */
const UNASSIGNED: Cluster = {
  id: "unassigned",
  label: "Still finding their sound",
  short: "New",
  description: "Hasn't picked enough songs yet for a cluster to show.",
  color: "#6b7280",
};

/**
 * `getCluster`/`clusterForLabel` read from this cache, not straight from `CLUSTERS`, because
 * clusters are no longer a fixed set of five: the real backend discovers them at runtime
 * (`topic_clusters`, scripts/recompute-topic-clusters.ts) with ids this module never hard-codes.
 * Seeded with the five static ones above so both functions work before any fetch happens (mock
 * mode never fetches at all, and real mode renders once with these while `/api/clusters` is
 * in flight) — `primeClusters` then merges the real rows in once they arrive.
 */
const clusterCache = new Map<string, Cluster>([...Object.entries(CLUSTERS), [UNASSIGNED.id, UNASSIGNED]]);

const LEGACY_LABEL_MAP: Record<string, { label: string; short: string }> = {
  "When it's too quiet at home": { label: "Quiet & Solitude", short: "Solitude" },
  "Armor for hard days": { label: "Motivation & Focus", short: "Motivation" },
  "Songs for someone I miss": { label: "Comfort & Longing", short: "Comfort" },
  "When I need to disappear for a bit": { label: "Escaping & Zoning Out", short: "Zoning Out" },
  "Songs that take me back": { label: "Nostalgia & Memories", short: "Nostalgia" },
};

function sanitizeCluster(c: Cluster): Cluster {
  const mapped = LEGACY_LABEL_MAP[c.label];
  if (!mapped) return c;
  return { ...c, label: mapped.label, short: mapped.short };
}

/** Merges freshly fetched cluster rows into the cache. Called once by `ClusterCacheProvider` in real-data mode. */
export function primeClusters(clusters: Cluster[]) {
  for (const c of clusters) clusterCache.set(c.id, sanitizeCluster(c));
}

export function getCluster(id: string): Cluster {
  const c = clusterCache.get(id);
  if (c) return sanitizeCluster(c);
  return UNASSIGNED;
}

export function clusterForLabel(label: string): Cluster {
  for (const c of clusterCache.values()) if (c.label === label) return c;
  return UNASSIGNED;
}

export const CONTEXT_TAGS: { id: ContextTag; label: string }[] = [
  { id: "late_night", label: "late at night" },
  { id: "on_repeat", label: "on repeat" },
  { id: "after_a_hard_day", label: "after a hard day" },
  { id: "alone", label: "when I'm alone" },
  { id: "commute", label: "on the way somewhere" },
  { id: "getting_ready", label: "getting ready" },
  { id: "workout", label: "working out" },
  { id: "studying", label: "studying" },
  { id: "with_friends", label: "with friends" },
];

export function contextTagLabel(tag: ContextTag) {
  return CONTEXT_TAGS.find((t) => t.id === tag)?.label ?? tag;
}

/** Which clusters each listening context nudges toward during inference. */
export const TAG_CLUSTER_WEIGHTS: Record<ContextTag, Partial<Record<ClusterId, number>>> = {
  late_night: { quiet_company: 1, carrying_loss: 0.4 },
  alone: { quiet_company: 0.9, somewhere_else: 0.3 },
  on_repeat: { carrying_loss: 0.6, old_selves: 0.4 },
  after_a_hard_day: { somewhere_else: 0.8, quiet_company: 0.4 },
  commute: { somewhere_else: 0.7, armor_up: 0.3 },
  getting_ready: { armor_up: 1 },
  workout: { armor_up: 1 },
  studying: { quiet_company: 0.5, somewhere_else: 0.3 },
  with_friends: { old_selves: 0.8 },
};
