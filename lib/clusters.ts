import type { ContextTag } from "./types";

export type ClusterId = "quiet_company" | "armor_up" | "carrying_loss" | "somewhere_else" | "old_selves";

export type Cluster = {
  id: ClusterId;
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
    label: "Company in the quiet",
    short: "Quiet company",
    description: "You reach for music when a room gets too still. It fills the space another voice would.",
    color: "#e3b778",
  },
  armor_up: {
    id: "armor_up",
    label: "Armor for hard days",
    short: "Armor up",
    description: "Music is how you put your game face on before something you'd rather not do.",
    color: "#86c8c0",
  },
  carrying_loss: {
    id: "carrying_loss",
    label: "Staying close to someone gone",
    short: "Carrying loss",
    description: "You return to songs that let you stay near a person, a place, or a time that's gone.",
    color: "#ad9fdc",
  },
  somewhere_else: {
    id: "somewhere_else",
    label: "A door to somewhere else",
    short: "Somewhere else",
    description: "When here gets to be too much, music is the fastest way out for a few minutes.",
    color: "#dc9fa9",
  },
  old_selves: {
    id: "old_selves",
    label: "Visiting who you used to be",
    short: "Old selves",
    description: "Songs are how you check in with earlier versions of yourself, and see how far you've come.",
    color: "#a9c48f",
  },
};

export const CLUSTER_IDS = Object.keys(CLUSTERS) as ClusterId[];

export function getCluster(id: string): Cluster {
  return CLUSTERS[id as ClusterId] ?? CLUSTERS.quiet_company;
}

export function clusterForLabel(label: string): Cluster {
  return CLUSTER_IDS.map((id) => CLUSTERS[id]).find((c) => c.label === label) ?? CLUSTERS.quiet_company;
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
