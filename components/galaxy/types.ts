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
};
