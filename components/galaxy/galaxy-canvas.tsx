"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion, useWebGL } from "@/hooks/use-capabilities";
import type { Arrival } from "@/hooks/use-galaxy-realtime";
import { computeLayout, placeArrival, placeSongs } from "@/lib/galaxy-layout";
import { songNodeId, type SongStar } from "@/lib/song-layer";
import type { GalaxyEdge, GalaxyNode } from "@/lib/types";
import { GalaxySvg } from "./galaxy-svg";
import type { GalaxyViewProps } from "./types";

export function GalaxySkeleton({ label }: { label?: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 starfield">
      <span className="relative flex size-4 items-center justify-center" aria-hidden>
        <span className="absolute size-10 rounded-full bg-primary/15 motion-safe:animate-orbit-pulse" />
        <span className="size-2 rounded-full bg-primary" />
      </span>
      {label ? <p className="font-serif text-base italic text-muted-foreground">{label}</p> : null}
    </div>
  );
}

const GalaxyScene = dynamic(() => import("./galaxy-scene"), {
  ssr: false,
  loading: () => <GalaxySkeleton />,
});

type Props = Omit<GalaxyViewProps, "layout" | "extra"> & {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  arrivals?: Arrival[];
  className?: string;
  /** The song layer. Placed after the people layout so adding one never moves anybody. */
  songs?: SongStar[];
  /** Song ids of the focused theme: lit, and joined into a constellation. */
  focusSongIds?: string[] | null;
};

export function GalaxyCanvas({ nodes, edges, arrivals = [], className, songs = [], focusSongIds = null, ...rest }: Props) {
  const layout = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);
  const extra = useMemo(() => arrivals.map((a) => placeArrival(layout, a.node, a.edges)), [arrivals, layout]);
  const songPoints = useMemo(() => placeSongs(layout, songs.map((s) => ({ id: s.id, cluster: s.cluster, listenerIds: s.listeners.map((l) => l.id) })), extra), [layout, songs, extra]);
  const songNodes = useMemo(
    () =>
      songs.map((s) => ({
        userId: songNodeId(s.id),
        name: s.song.title,
        cluster: s.cluster,
        whys: Object.fromEntries(s.whyCounts.map((w) => [w.id, w.count / Math.max(1, s.listeners.length)])),
        bridge: s.isBridge,
        topMotivations: [],
        isMe: false,
        kind: "song" as const,
        weight: s.weight,
      })),
    [songs],
  );
  const allNodes = useMemo(() => [...nodes, ...arrivals.map((a) => a.node), ...songNodes], [nodes, arrivals, songNodes]);

  // A theme is a constellation: each of its songs is threaded to its two nearest siblings.
  const focusIds = useMemo(() => (focusSongIds ? new Set(focusSongIds.map(songNodeId)) : null), [focusSongIds]);
  const constellation = useMemo(() => {
    if (!focusIds) return [];
    const pts = songPoints.filter((p) => focusIds.has(p.id));
    const seen = new Set<string>();
    const out: GalaxyEdge[] = [];
    for (const a of pts) {
      [...pts]
        .filter((b) => b.id !== a.id)
        .sort((b1, b2) => Math.hypot(a.x - b1.x, a.y - b1.y, a.z - b1.z) - Math.hypot(a.x - b2.x, a.y - b2.y, a.z - b2.z))
        .slice(0, 2)
        .forEach((b) => {
          const key = [a.id, b.id].sort().join("|");
          if (seen.has(key)) return;
          seen.add(key);
          out.push({ source: a.id, target: b.id, similarity: 0.95, sharedMotivation: "", sharedSongs: 0, sharedArtists: 0 });
        });
    }
    return out;
  }, [focusIds, songPoints]);

  // A selected song is threaded to everyone who has it, and they light up while everything else steps back.
  const selectedSong = useMemo(() => songs.find((s) => songNodeId(s.id) === rest.selectedId), [songs, rest.selectedId]);
  const listenerThreads = useMemo(
    () => (selectedSong ? selectedSong.listeners.map((l) => ({ source: songNodeId(selectedSong.id), target: l.id, similarity: 0.9, sharedMotivation: "", sharedSongs: 0, sharedArtists: 0 })) : []),
    [selectedSong],
  );
  const spotlight = useMemo(() => (selectedSong ? new Set([songNodeId(selectedSong.id), ...selectedSong.listeners.map((l) => l.id)]) : focusIds), [selectedSong, focusIds]);

  const allEdges = useMemo(() => [...edges, ...arrivals.flatMap((a) => a.edges), ...constellation, ...listenerThreads], [edges, arrivals, constellation, listenerThreads]);
  const allExtra = useMemo(() => [...extra, ...songPoints], [extra, songPoints]);

  const reduced = useReducedMotion();
  const webgl = useWebGL();
  const View = reduced || !webgl ? GalaxySvg : GalaxyScene;

  return (
    <div className={className ?? "absolute inset-0 starfield"}>
      <View nodes={allNodes} edges={allEdges} layout={layout} extra={allExtra} focusIds={spotlight} {...rest} />
    </div>
  );
}
