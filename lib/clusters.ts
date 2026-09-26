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
    label: "When it's too quiet at home",
    short: "Too quiet",
    description: "You put something on so the room isn't silent, usually late and usually alone.",
    color: "#c9a66b",
  },
  armor_up: {
    id: "armor_up",
    label: "Armor for hard days",
    short: "Hard days",
    description: "What you play before the thing you're dreading.",
    color: "#7fa9a3",
  },
  carrying_loss: {
    id: "carrying_loss",
    label: "Songs for someone I miss",
    short: "Missing someone",
    description: "You go back to songs tied to a person, a place, or a time that's gone.",
    color: "#9a8fbf",
  },
  somewhere_else: {
    id: "somewhere_else",
    label: "When I need to disappear for a bit",
    short: "Disappearing",
    description: "Headphones in, a few minutes somewhere else.",
    color: "#c48e96",
  },
  old_selves: {
    id: "old_selves",
    label: "Songs that take me back",
    short: "Taking me back",
    description: "One song and you're in a specific year again.",
    color: "#9db084",
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
