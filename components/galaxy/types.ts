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
  /** Travel to a distant community galaxy, arcing out and back in. */
  flyToDestination(id: string, opts?: { duration?: number; lift?: number }): Promise<void>;
  /** Travel back to your home galaxy and light everyone in it. */
  returnHome(duration?: number): Promise<void>;
  /** Fly a star from wherever it is now into its orbit around you, trailing light. */
  flyIntoOrbit(personId: string, duration?: number): Promise<void>;
};

/** A distant community galaxy: a music scene, drawn far from home. */
export type GalaxyDestination = {
  id: string;
  name: string;
  /** Hex for three.js. */
  color: string;
  /** 0 close to your taste .. 1 far from it. Sets how far away it sits. */
  distance: number;
};

/** A lasting line from someone in your galaxy to the community you found them in. */
export type GalaxyBridge = { personId: string; destinationId: string };

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
  /**
   * Build the galaxy out from you on its first render: you appear first, then everyone else fades
   * in by their distance from you, rippling outward, and the connection lines fade in last.
   * 3D view only (the SVG fallback, used for reduced motion, shows everything at once).
   */
  buildOut?: boolean;
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
  /** People who exist but aren't drawn, per cluster. Rendered as dust so a bounded view doesn't read as a small galaxy. */
  hidden?: { total: number; byCluster: Record<string, number> };
  /** Distant community galaxies. Placed by the layout (`Layout.destinations`). */
  destinations?: GalaxyDestination[];
  bridges?: GalaxyBridge[];
  /** Tapping a distant community galaxy. */
  onSelectDestination?: (id: string) => void;
};
