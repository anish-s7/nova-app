/**
 * Pure mapping from the backend's galaxy window (lib/matching/galaxyWindow.ts, served by
 * GET /api/galaxy and /api/galaxy/more) to the view shapes the Galaxy UI already consumes
 * (GalaxyResponse / GalaxyMore in lib/types.ts). No fetching, no React, no mock imports:
 * lib/api.ts calls these when NEXT_PUBLIC_GALAXY_SOURCE=http.
 *
 * Fields the contract can't supply are filled with neutral values and marked NOT IN CONTRACT.
 */

import type { GalaxyEdge, GalaxyMore, GalaxyNode, GalaxyResponse } from "./types";
import type { GalaxyMoreWindow, GalaxyWindow, WindowEdge, WindowNode } from "./matching/galaxyWindow";

export type { GalaxyMoreWindow, GalaxyWindow };

function toNode(n: WindowNode, meId: string): GalaxyNode {
  return {
    userId: n.profileId,
    name: n.displayName,
    cluster: n.cluster,
    topMotivations: [], // NOT IN CONTRACT: no motivations table (lib/types.ts #4)
    isMe: n.profileId === meId,
    ...(n.far ? { far: true } : {}),
  };
}

function toEdge(e: WindowEdge): GalaxyEdge {
  return {
    source: e.source,
    target: e.target,
    similarity: e.similarity,
    sharedMotivation: "", // NOT IN CONTRACT
    sharedSongs: 0, // NOT IN CONTRACT
    sharedArtists: 0, // NOT IN CONTRACT
  };
}

/** Highest-similarity edge touching `meId`, if any. */
function topMatch(edges: WindowEdge[], meId: string): string | undefined {
  const mine = edges.filter((e) => e.source === meId || e.target === meId).sort((a, b) => b.similarity - a.similarity)[0];
  if (!mine) return undefined;
  return mine.source === meId ? mine.target : mine.source;
}

export function galaxyFromWindow(w: GalaxyWindow): GalaxyResponse {
  const me = w.nodes.find((n) => n.profileId === w.meId);
  const others = w.nodes.filter((n) => n.profileId !== w.meId);
  return {
    nodes: [...(me ? [toNode(me, w.meId)] : []), ...others.map((n) => toNode(n, w.meId))],
    edges: w.edges.map(toEdge),
    topMatchId: topMatch(w.edges, w.meId),
    status: "ready",
    sampled: w.sampled,
    hidden: w.hidden,
  };
}

export function galaxyMoreFromWindow(w: GalaxyMoreWindow, meId: string): GalaxyMore {
  return {
    arrivals: w.nodes.map((n) => ({
      node: toNode(n, meId),
      edges: w.edges.filter((e) => e.source === n.profileId || e.target === n.profileId).map(toEdge),
    })),
    remaining: w.remaining,
  };
}
