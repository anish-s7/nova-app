import type { RefObject } from "react";
import type { Layout, LayoutPoint } from "@/lib/galaxy-layout";
import type { GalaxyEdge, GalaxyNode } from "@/lib/types";

/** Camera choreography shared by the explore view and the reveal sequence. */
export type GalaxyApi = {
  igniteMe(duration?: number): Promise<void>;
  pullBackToOverview(duration?: number): Promise<void>;
  /** `lift` (0–0.4) frames the star above center, leaving room for a sheet below. */
  flyTo(userId: string, opts?: { duration?: number; distance?: number; lift?: number }): Promise<void>;
  recenter(): Promise<void>;
  /** Frame one cluster's neighborhood; null returns to the overview. */
  flyToCluster(cluster: string | null): Promise<void>;
  /** Frame a set of stars (a theme's songs); an empty set returns to the overview. */
  flyToGroup(ids: string[]): Promise<void>;
};

export type GalaxyViewProps = {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  layout: Layout;
  /** Positions for nodes that arrived after the layout ran. */
  extra: LayoutPoint[];
  selectedId?: string | null;
  onSelect?: (userId: string | null) => void;
  apiRef?: RefObject<GalaxyApi | null>;
  /** "dark" starts with only the user's star unlit, for the reveal. */
  initialPhase?: "explore" | "dark";
  interactive?: boolean;
  onReady?: () => void;
  /** Dims every other cluster so one "why" stands out. */
  focusCluster?: string | null;
  /** "people" shows the people layer; "songs" shows the song layer and ghosts everyone else. */
  mode?: "people" | "songs";
  /** People you have traded songs with. From BOND_AT songs the thread to you glows. */
  threads?: { userId: string; count: number }[];
  /** Song-layer focus: only these node ids stay lit. */
  focusIds?: ReadonlySet<string> | null;
  /** Stars mid-departure, by id: 0 fully lit .. 1 gone. Used by the live simulation. */
  fading?: ReadonlyMap<string, number>;
};
