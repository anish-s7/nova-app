/**
 * Shapes for the AI listening portrait and whole-profile connection threads. No imports, so server
 * code (lib/gemini, lib/matching, routes) and client code (lib/real-api, lib/api) can share them.
 */

/** A song named by the model. Always resolved back against real picks before it's shown. */
export type SongRef = { title: string; artist: string };

export type PortraitMotivation = {
  label: string;
  description: string;
  /** One of lib/clusters.ts CLUSTER_IDS. */
  cluster: string;
  /** 0..1 */
  confidence: number;
  evidence: { text: string; songTitles: string[] }[];
};

/** Gemini's reading of one person's public picks (profile_portraits.portrait). */
export type Portrait = {
  /** One sentence, second person, shown as the "Here's what I heard" headline. */
  headline: string;
  /** Three short observations, shown one by one on the reading screen. */
  highlights: string[];
  motivations: PortraitMotivation[];
  /** What kind of person they'd likely connect with. Used when assessing connections. */
  seeks: string;
  /** A pull between two different uses of music, if there is one. */
  tensions?: string;
};

/** One specific shared "why" between two people, anchored by one song on each side. */
export type CardThread = {
  why: string;
  song_a: SongRef;
  song_b: SongRef;
  evidence_a: string;
  evidence_b: string;
};
