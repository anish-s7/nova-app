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

/** The signed-in user's real id is presented to the UI as `alias` (ME_ID), like the mock world does. */
function toNode(n: WindowNode, meId: string, alias = meId): GalaxyNode {
  return {
    userId: n.profileId === meId ? alias : n.profileId,
    name: n.displayName,
    cluster: n.cluster,
    topMotivations: [], // NOT IN CONTRACT: no motivations table (lib/types.ts #4)
    isMe: n.profileId === meId,
    ...(n.far ? { far: true } : {}),
    ...(n.viewerSimilarity != null ? { youSimilarity: n.viewerSimilarity } : {}),
  };
}

function toEdge(e: WindowEdge, meId = "", alias = meId): GalaxyEdge {
  const id = (x: string) => (x === meId ? alias : x);
  return {
    source: id(e.source),
    target: id(e.target),
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

/** `alias` replaces the viewer's own id in nodes and edges (lib/api.ts passes ME_ID); omit it to keep real ids. */
export function galaxyFromWindow(w: GalaxyWindow, alias = w.viewerId ?? w.meId): GalaxyResponse {
  // Hopped: the viewer stays `isMe` (the way back); the window's center is reported as centerId.
  const viewer = w.viewerId ?? w.meId;
  const me = w.nodes.find((n) => n.profileId === viewer);
  const others = w.nodes.filter((n) => n.profileId !== viewer);
  return {
    nodes: [...(me ? [toNode(me, viewer, alias)] : []), ...others.map((n) => toNode(n, viewer, alias))],
    edges: w.edges.map((e) => toEdge(e, viewer, alias)),
    topMatchId: topMatch(w.edges, w.meId),
    ...(w.viewerId ? { centerId: w.meId } : {}),
    status: "ready",
    sampled: w.sampled,
    hidden: w.hidden,
  };
}

export function galaxyMoreFromWindow(w: GalaxyMoreWindow, meId: string, alias = meId): GalaxyMore {
  return {
    arrivals: w.nodes.map((n) => ({
      node: toNode(n, meId, alias),
      edges: w.edges.filter((e) => e.source === n.profileId || e.target === n.profileId).map((e) => toEdge(e, meId, alias)),
    })),
    remaining: w.remaining,
  };
}
