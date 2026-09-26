"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Compass, LocateFixed, Plus, X } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { BottomSheet } from "@/components/bottom-sheet";
import { GalaxyCanvas, GalaxySkeleton } from "@/components/galaxy/galaxy-canvas";
import type { GalaxyApi } from "@/components/galaxy/types";
import { ClusterFilter } from "@/components/galaxy/cluster-filter";
import { AddSongSheetContent, type AddedInfo } from "@/components/galaxy/add-song-sheet";
import { ClusterSheetContent } from "@/components/galaxy/cluster-sheet";
import { SongSheetContent } from "@/components/galaxy/song-sheet";
import { WanderSheetContent } from "@/components/galaxy/wander-sheet";
import { ModeToggle, ThemeFilter } from "@/components/galaxy/theme-filter";
import { Logo } from "@/components/logo";
import { OverlapBadge } from "@/components/overlap-badge";
import { SimilarityRing } from "@/components/similarity-ring";
import { ThemeTag } from "@/components/theme-tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { useGalaxyRealtime, type Arrival } from "@/hooks/use-galaxy-realtime";
import { getConversations, getGalaxy, getGalaxyMore, getSongLayer, getUser, ME_ID } from "@/lib/api";
import { getCluster } from "@/lib/clusters";
import { useSession } from "@/lib/session";
import { songConnections } from "@/lib/song-connections";
import { isSongNode, songNodeId } from "@/lib/song-layer";
import { THEME_THRESHOLD } from "@/lib/themes";
import { BOND_AT } from "@/lib/thread";
import type { GalaxyEdge, GalaxyNode } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAX_HOPS = 4;

export default function GalaxyPage() {
  const session = useSession();
  const version = session.version;
  // ?limit=20 shrinks the window so the bounded view is easy to see with the small mock world.
  const [limit] = useState<number | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const n = Number(new URLSearchParams(location.search).get("limit"));
    return Number.isFinite(n) && n > 1 ? n : undefined;
  });
  // Hops: the stars you've stepped through, in order. Empty = your own galaxy; the last entry is the current center.
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const center = trail.length ? trail[trail.length - 1].id : undefined;
  const { data, error, mutate, isValidating } = useSWR(["galaxy", version, limit, center], () => getGalaxy({ limit, center }), { revalidateOnFocus: false });
  const liveArrivals = useGalaxyRealtime(!!data && !center);
  // "More here" pages, per cluster. Keyed by session version and center so a reset or a hop starts clean.
  const [moreState, setMoreState] = useState<{ version: number; center?: string; byCluster: Record<string, { arrivals: Arrival[]; remaining: number }> }>({ version, center, byCluster: {} });
  const [loadingMore, setLoadingMore] = useState(false);
  const more = useMemo(() => (moreState.version === version && moreState.center === center ? moreState.byCluster : {}), [moreState, version, center]);
  const arrivals = useMemo(() => [...(center ? [] : liveArrivals), ...Object.values(more).flatMap((m) => m.arrivals)], [liveArrivals, more, center]);
  const { data: convos } = useSWR(["conversations", version], getConversations, { refreshInterval: 4000 });
  const threads = useMemo(() => (convos ?? []).filter((c) => c.threadSongs).map((c) => ({ userId: c.userId, count: c.threadSongs! })), [convos]);
  const apiRef = useRef<GalaxyApi | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedArrival, setDismissedArrival] = useState(false);
  const [focusCluster, setFocusCluster] = useState<string | null>(null);
  const [clusterOpen, setClusterOpen] = useState(false);
  const [wandering, setWandering] = useState(false);
  const [mode, setMode] = useState<"people" | "songs">("people");
  const [themeFocus, setThemeFocus] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ songId: string | null } | null>(null);
  const [celebrate, setCelebrate] = useState<{ title: string; body: string } | null>(null);
  const pendingFly = useRef<{ songId: string; themeId: string | null } | null>(null);
  const { data: layer } = useSWR(["song-layer", version, session.picks?.length ?? 0], () => getSongLayer(), { revalidateOnFocus: false });
  const hint = useFirstVisitHint();

  const nodes: GalaxyNode[] = data ? [...data.nodes, ...arrivals.map((a) => a.node)] : [];
  const edges: GalaxyEdge[] = data ? [...data.edges, ...arrivals.flatMap((a) => a.edges)] : [];
  const selected = nodes.find((n) => n.userId === selectedId);
  // While hopped, the scene draws the hopped star at the center; you become an ordinary star labelled "You".
  const viewNodes = useMemo(
    () => (data ? (center ? data.nodes.map((n) => (n.userId === center ? { ...n, isMe: true } : n.isMe ? { ...n, isMe: false, name: "You" } : n)) : data.nodes) : []),
    [data, center],
  );
  const hop = (id: string, name: string) => {
    if (trail.length >= MAX_HOPS || id === center) return;
    setTrail([...trail, { id, name }]);
    resetForNewCenter();
  };
  const backTo = (depth: number) => {
    setTrail(trail.slice(0, depth));
    resetForNewCenter();
  };
  const resetForNewCenter = () => {
    setSelectedId(null);
    setFocusCluster(null);
    setClusterOpen(false);
    setConnecting(false);
  };
  // A new center is a new layout: frame it once it has loaded.
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => apiRef.current?.recenter(), 250);
    return () => clearTimeout(t);
  }, [center, data]);
  const arrival = liveArrivals[0]?.node;
  // People still hidden, after whatever "more here" has revealed.
  const hiddenNow = useMemo(() => {
    if (!data?.hidden) return undefined;
    const byCluster = { ...data.hidden.byCluster };
    let total = data.hidden.total;
    for (const [id, m] of Object.entries(more)) {
      byCluster[id] = Math.max(0, (byCluster[id] ?? 0) - m.arrivals.length);
      total -= m.arrivals.length;
    }
    return { total: Math.max(0, total), byCluster };
  }, [data, more]);
  const hiddenHere = focusCluster ? (hiddenNow?.byCluster[focusCluster] ?? 0) : 0;

  const showMore = async (cluster: string) => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const have = more[cluster]?.arrivals.length ?? 0;
      const page = await getGalaxyMore(cluster, have, 40, limit, center);
      setMoreState((s) => {
        const cur = s.version === version && s.center === center ? s.byCluster : {};
        return { version, center, byCluster: { ...cur, [cluster]: { arrivals: [...(cur[cluster]?.arrivals ?? []), ...page.arrivals], remaining: page.remaining } } };
      });
      // The new stars need a frame to be placed before the camera can frame the cluster.
      setTimeout(() => apiRef.current?.flyToCluster(cluster), 150);
    } finally {
      setLoadingMore(false);
    }
  };
  const themeState = layer?.themes.find((t) => t.theme.id === themeFocus);
  const focusSongIds = mode === "songs" && themeState ? themeState.songIds : null;
  const selectedSong = selectedId && isSongNode(selectedId) ? layer?.stars.find((st) => songNodeId(st.id) === selectedId) : undefined;
  const [connecting, setConnecting] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const connectionLinks = useMemo(() => (connecting && selectedSong && layer ? songConnections(selectedSong, layer) : null), [connecting, selectedSong, layer]);
  const connectionKey = connectionLinks ? [selectedSong!.id, ...connectionLinks.map((c) => c.star.id)].join("|") : "";
  // In connections mode the camera frames the song and everything linked to it, so the threads clear the sheet.
  useEffect(() => {
    if (!connectionKey) return;
    apiRef.current?.flyToGroup(connectionKey.split("|").map(songNodeId));
  }, [connectionKey]);
  const songList = layer ? (themeState ? layer.stars.filter((st) => themeState.songIds.includes(st.id)) : layer.stars).slice(0, 12) : [];
  const closest = closestTo(center ?? ME_ID, nodes, edges, focusCluster, 6);

  const select = (id: string | null) => {
    const keepConnecting = connecting && !!id && isSongNode(id);
    setSelectedId(id);
    setConnecting(keepConnecting);
    setClusterOpen(false);
    hint.dismiss();
    if (id && !keepConnecting) apiRef.current?.flyTo(id, { duration: 1200, distance: 18, lift: 0.1 });
  };

  const changeMode = (m: "people" | "songs") => {
    setMode(m);
    setSelectedId(null);
    setConnecting(false);
    setFocusCluster(null);
    setThemeFocus(null);
    setClusterOpen(false);
    hint.dismiss();
    apiRef.current?.recenter();
  };

  const focusTheme = (id: string | null) => {
    setThemeFocus(id);
    setSelectedId(null);
    setConnecting(false);
    hint.dismiss();
    const ids = id ? (layer?.themes.find((t) => t.theme.id === id)?.songIds ?? []).map(songNodeId) : [];
    apiRef.current?.flyToGroup(ids);
  };

  const onAdded = (info: AddedInfo) => {
    const formed = info.formed[0];
    setAdding(null);
    setMode("songs");
    setSelectedId(null);
    setFocusCluster(null);
    setThemeFocus(formed?.id ?? null);
    pendingFly.current = { songId: info.star.id, themeId: formed?.id ?? null };
    setCelebrate(
      formed
        ? { title: `A new cluster formed: ${formed.label}`, body: `${THEME_THRESHOLD} songs now share this moment, and yours was the one that tipped it.` }
        : info.wasThere
          ? { title: `${info.star.song.title} just got brighter`, body: `${info.others} ${info.others === 1 ? "person" : "people"} already had it. You're in their orbit now.` }
          : { title: `${info.star.song.title} is on the map`, body: `Nobody had it before you. It landed near the ${info.cluster.short.toLowerCase()} stars.` },
    );
  };

  // Once the song layer has caught up with the new pick, fly to what changed.
  useEffect(() => {
    const pending = pendingFly.current;
    if (!pending || !layer?.stars.some((st) => st.id === pending.songId && st.listeners.some((l) => l.isMe && l.daysAgo === 0))) return;
    pendingFly.current = null;
    if (pending.themeId) {
      const ids = (layer.themes.find((t) => t.theme.id === pending.themeId)?.songIds ?? []).map(songNodeId);
      apiRef.current?.flyToGroup(ids);
    } else apiRef.current?.flyTo(songNodeId(pending.songId), { duration: 1200, distance: 14, lift: 0.1 });
  }, [layer]);

  // When a thread reaches BOND_AT songs, say so once: the line to that person starts to glow.
  useEffect(() => {
    if (!convos || !data) return;
    const bonded = threads.filter((t) => t.count >= BOND_AT);
    let seen: string[] | null = null;
    try {
      seen = JSON.parse(sessionStorage.getItem(BOND_KEY) ?? "null");
    } catch {}
    const fresh = seen ? bonded.find((t) => !seen.includes(t.userId)) : undefined;
    try {
      sessionStorage.setItem(BOND_KEY, JSON.stringify([...new Set([...(seen ?? []), ...bonded.map((t) => t.userId)])]));
    } catch {}
    if (!fresh) return;
    const name = nodes.find((n) => n.userId === fresh.userId)?.name ?? "them";
    setCelebrate({ title: `You and ${name} are bonded`, body: `${fresh.count} songs traded. The line between you glows now.` });
    if (mode === "people") apiRef.current?.flyTo(fresh.userId, { duration: 1400, distance: 20, lift: 0.1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to new thread counts only
  }, [threads]);

  useEffect(() => {
    if (!celebrate) return;
    const t = setTimeout(() => setCelebrate(null), 9000);
    return () => clearTimeout(t);
  }, [celebrate]);

  const focus = (id: string | null) => {
    setFocusCluster(id);
    setClusterOpen(false);
    setSelectedId(null);
    hint.dismiss();
    // A cluster with nobody drawn has nothing to fly to: reveal its first page instead.
    const drawnHere = id ? nodes.some((n) => !n.isMe && n.cluster === id) : true;
    if (id && !drawnHere && (hiddenNow?.byCluster[id] ?? 0) > 0) void showMore(id);
    else apiRef.current?.flyToCluster(id);
  };

  if (error) {
    return (
      <main className="starfield flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-serif text-2xl italic">The galaxy didn&apos;t load.</p>
        <Button className="h-11 px-6" disabled={isValidating} onClick={() => mutate()}>
          Try again
        </Button>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <h1 className="sr-only">Your galaxy</h1>
      {data ? (
        <div className="absolute inset-0" onPointerDown={hint.dismiss}>
          <GalaxyCanvas
            nodes={viewNodes}
            edges={data.edges}
            arrivals={arrivals}
            apiRef={apiRef}
            selectedId={selectedId}
            onSelect={select}
            focusCluster={focusCluster}
            mode={mode}
            threads={threads}
            songs={layer?.stars}
            focusSongIds={focusSongIds}
            connections={connectionLinks?.map((c) => ({ songId: c.star.id, score: c.score })) ?? null}
            hidden={hiddenNow}
          />
        </div>
      ) : (
        <GalaxySkeleton label="Arranging everyone by why they listen…" />
      )}

      <header className="relative z-10 border-b border-white/10 bg-background/90">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            {data && mode === "people" ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold tabular-nums text-foreground">{(nodes.length - 1 + (hiddenNow?.total ?? 0)).toLocaleString()}</span> listeners
              </p>
            ) : null}
            <ModeToggle value={mode} onChange={changeMode} />
          </div>
        </div>
        {trail.length ? <HopTrail trail={trail} onBack={backTo} /> : null}
        {data && mode === "people" ? <ClusterFilter nodes={nodes} hidden={hiddenNow?.byCluster} value={focusCluster} onChange={focus} className="pb-3" /> : null}
        {data && mode === "songs" && layer ? <ThemeFilter themes={layer.themes} value={themeFocus} onChange={focusTheme} className="pb-3" /> : null}
        {mode === "songs" && themeState ? (
          <div key={themeState.theme.id} className="mx-4 mb-3 flex items-center gap-3 border-l-2 pl-3" style={{ borderColor: themeState.theme.color }}>
            <p className="min-w-0 flex-1 text-pretty text-sm leading-snug text-foreground/80">
              {themeState.theme.description}
              {themeState.formed ? null : (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {themeState.songIds.length} of {THEME_THRESHOLD} songs. One more and this becomes a cluster.
                </span>
              )}
            </p>
            <button type="button" onClick={() => setAdding({ songId: null })} className="inline-flex min-h-9 shrink-0 items-center border border-white/15 px-3 text-xs font-medium hover:bg-white/5">
              Add yours
            </button>
          </div>
        ) : null}
        {focusCluster ? (
          <div key={focusCluster} className="mx-4 mb-3 flex items-center gap-3 border-l-2 pl-3" style={{ borderColor: getCluster(focusCluster).color }}>
            <p className="min-w-0 flex-1 text-pretty text-sm leading-snug text-foreground/80">{getCluster(focusCluster).description}</p>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setClusterOpen(true);
              }}
              className="inline-flex min-h-9 shrink-0 items-center border border-white/15 px-3 text-xs font-medium hover:bg-white/5"
            >
              See the songs
            </button>
            {hiddenHere > 0 ? (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => showMore(focusCluster)}
                className="inline-flex min-h-9 shrink-0 items-center border border-white/15 px-3 text-xs font-medium hover:bg-white/5 disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : `More here · ${hiddenHere.toLocaleString()}`}
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {celebrate ? (
        <div role="status" className="relative z-10 mx-4 mt-2 flex items-start gap-2 border border-white/15 bg-background/95 py-2 pl-3 pr-1">
          <div className="min-w-0 flex-1">
            <p className="font-serif text-base italic leading-snug">{celebrate.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{celebrate.body}</p>
          </div>
          <button type="button" onClick={() => setCelebrate(null)} aria-label="Dismiss" className="inline-flex size-9 shrink-0 items-center justify-center text-muted-foreground hover:bg-white/5">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {mode === "people" && arrival && !dismissedArrival ? (
        <div role="status" className="relative z-10 mx-4 mt-2 flex items-center gap-2 border border-white/10 bg-background/90 py-1 pl-1 pr-1">
          <UserAvatar name={arrival.name} cluster={arrival.cluster} size={32} />
          <button type="button" onClick={() => select(arrival.userId)} className="min-h-10 min-w-0 flex-1 truncate text-left text-sm">
            <span className="font-medium">{arrival.name}</span> <span className="text-muted-foreground">just joined, close to you</span>
          </button>
          <button type="button" onClick={() => setDismissedArrival(true)} aria-label="Dismiss" className="inline-flex size-10 items-center justify-center text-muted-foreground hover:bg-white/5">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {hint.visible && data ? (
        <p className="pointer-events-none relative z-10 mx-4 mt-2 text-xs text-muted-foreground">{mode === "songs" ? "Every star is a song. Brighter means more people share it." : "Drag to explore, pinch to zoom, tap a person."}</p>
      ) : null}

      <div className="pointer-events-none relative z-10 mt-auto flex items-end gap-2 p-4">
        {data && mode === "songs" ? (
          <section aria-labelledby="songs-heading" className="pointer-events-auto min-w-0 flex-1 border border-white/10 bg-background/90 px-3 pb-2 pt-2.5">
            <h2 id="songs-heading" className="px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {themeState ? themeState.theme.short : "Most shared right now"}
            </h2>
            <ul className="no-scrollbar -mx-1 mt-1 flex gap-1 overflow-x-auto px-1">
              {songList.map((st) => (
                <li key={st.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => select(songNodeId(st.id))}
                    aria-pressed={selectedId === songNodeId(st.id)}
                    aria-label={`${st.song.title}, ${st.weight} ${st.weight === 1 ? "person" : "people"}`}
                    className={cn("flex w-16 flex-col items-center gap-0.5 py-1 transition-colors hover:bg-white/5", selectedId === songNodeId(st.id) && "bg-white/[0.07]")}
                  >
                    <AlbumArt song={st.song} size={40} />
                    <span className="w-full truncate text-center text-[11px] text-foreground/85">{st.song.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : data ? (
          <section aria-labelledby="closest-heading" className="pointer-events-auto min-w-0 flex-1 border border-white/10 bg-background/90 px-3 pb-2 pt-2.5">
            <h2 id="closest-heading" className="px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {focusCluster ? `Closest · ${getCluster(focusCluster).short}` : "Closest to you"}
            </h2>
            {closest.length === 0 ? (
              <p className="px-1 pb-1.5 pt-1 text-xs text-muted-foreground">Nobody here is close to you yet. Tap a star to meet them anyway.</p>
            ) : null}
            <ul className="no-scrollbar -mx-1 mt-1 flex gap-1 overflow-x-auto px-1">
              {closest.map(({ node, similarity }) => (
                <li key={node.userId} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => select(node.userId)}
                    aria-pressed={selectedId === node.userId}
                    aria-label={`${node.name}, ${Math.round(similarity * 100)}% same why`}
                    className={cn("flex w-14 flex-col items-center gap-0.5 py-1 transition-colors hover:bg-white/5", selectedId === node.userId && "bg-white/[0.07]")}
                  >
                    <SimilarityRing value={similarity} cluster={node.cluster} size={34}>
                      <UserAvatar name={node.name} cluster={node.cluster} size={34} />
                    </SimilarityRing>
                    <span className="w-full truncate text-center text-[11px] text-foreground/85">{node.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <span className="flex-1" />
        )}
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setClusterOpen(false);
            setWandering(true);
          }}
          aria-label="Wander: find someone who hears your songs differently"
          className="pointer-events-auto inline-flex size-12 shrink-0 items-center justify-center border border-white/10 bg-background/90 hover:bg-background"
        >
          <Compass className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setAdding({ songId: null })}
          aria-label="Add a song"
          className="pointer-events-auto inline-flex size-12 shrink-0 items-center justify-center border border-primary/50 bg-primary/15 text-primary hover:bg-primary/25"
        >
          <Plus className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            setFocusCluster(null);
            setThemeFocus(null);
            apiRef.current?.recenter();
          }}
          aria-label="Recenter on the whole galaxy"
          className="pointer-events-auto inline-flex size-12 shrink-0 items-center justify-center border border-white/10 bg-background/90 hover:bg-background"
        >
          <LocateFixed className="size-5" aria-hidden />
        </button>
      </div>

      <BottomSheet open={wandering} onClose={() => setWandering(false)} label="Wander">
        {wandering ? <WanderSheetContent /> : null}
      </BottomSheet>

      <BottomSheet open={!!adding} onClose={() => setAdding(null)} label="Add a song">
        {adding && layer ? <AddSongSheetContent layer={layer} initialSongId={adding.songId} onAdded={onAdded} /> : null}
      </BottomSheet>

      <BottomSheet
        open={!!selectedSong}
        peek={connecting}
        minimized={connecting && minimized}
        onToggleMinimized={connecting ? () => setMinimized((m) => !m) : undefined}
        onClose={() => {
          setSelectedId(null);
          setConnecting(false);
          setMinimized(false);
        }}
        label={selectedSong ? `${selectedSong.song.title}` : "Song"}
      >
        {selectedSong && layer ? (
          <SongSheetContent
            star={selectedSong}
            layer={layer}
            connecting={connecting}
            onConnecting={(on) => {
              setConnecting(on);
              if (!on) setMinimized(false);
            }}
            onOpenSong={(songId) => select(songNodeId(songId))}
            onAddYours={(songId) => {
              setSelectedId(null);
              setAdding({ songId });
            }}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet open={clusterOpen && !!focusCluster} onClose={() => setClusterOpen(false)} label="Songs in this cluster">
        {focusCluster ? <ClusterSheetContent clusterId={focusCluster} /> : null}
      </BottomSheet>

      <BottomSheet open={!!selected} onClose={() => setSelectedId(null)} label={selected ? `${selected.name}'s star` : "Star"}>
        {selected ? <StarPreview
            node={selected}
            traded={threads.find((t) => t.userId === selected.userId)?.count ?? 0}
            hop={{ isCenter: selected.userId === center, hopped: !!center, canHop: trail.length < MAX_HOPS, onHop: () => hop(selected.userId, selected.name), onBack: () => backTo(0) }}
          /> : null}
      </BottomSheet>
    </main>
  );
}

type HopControls = { isCenter: boolean; hopped: boolean; canHop: boolean; onHop: () => void; onBack: () => void };

/** Breadcrumb for hops: You › Maya › Theo. Tapping a crumb steps back to it. */
function HopTrail({ trail, onBack }: { trail: { id: string; name: string }[]; onBack: (depth: number) => void }) {
  const crumb = "inline-flex min-h-9 items-center px-1 text-xs";
  return (
    <nav aria-label="Galaxy trail" className="mx-4 mb-3 flex flex-wrap items-center gap-x-1 text-muted-foreground">
      <button type="button" onClick={() => onBack(0)} className={cn(crumb, "hover:text-foreground")}>
        You
      </button>
      {trail.map((h, i) => (
        <span key={h.id} className="inline-flex items-center gap-1">
          <span aria-hidden>›</span>
          {i === trail.length - 1 ? (
            <span aria-current="page" className={cn(crumb, "font-medium text-foreground")}>
              {h.name}&apos;s galaxy
            </span>
          ) : (
            <button type="button" onClick={() => onBack(i + 1)} className={cn(crumb, "hover:text-foreground")}>
              {h.name}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}

function StarPreview({ node, traded, hop }: { node: GalaxyNode; traded: number; hop: HopControls }) {
  const { data } = useSWR(node.isMe ? null : ["user", node.userId], ([, id]) => getUser(id));

  if (node.isMe) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <UserAvatar name="You" cluster={node.cluster} isMe size={48} ring />
          <div>
            <h2 className="text-xl font-semibold">This is you</h2>
            <ThemeTag cluster={node.cluster} size="sm" className="mt-1" />
          </div>
        </div>
        {hop.hopped ? (
          <Button className="h-11" onClick={hop.onBack}>
            Back to your galaxy
          </Button>
        ) : null}
        <Link href="/me" className={cn(buttonVariants({ variant: "secondary" }), "h-11")}>
          Review your reasons
        </Link>
      </div>
    );
  }

  const edge = data?.edge;
  const moment = data?.listening;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <UserAvatar name={node.name} cluster={node.cluster} size={48} ring />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold">{node.name}</h2>
          {edge ? <OverlapBadge sharedSongs={edge.sharedSongs} sharedArtists={edge.sharedArtists} variant="both" className="mt-1" /> : <Skeleton className="mt-1 h-5 w-40" />}
        </div>
      </div>

      <div className="border-l-2 pl-3" style={{ borderColor: getCluster(node.cluster).color }}>
        {edge && moment ? (
          <>
            <p className="text-xs text-muted-foreground">You both: {edge.sharedMotivation}</p>
            <p className="mt-2 font-serif text-lg italic leading-snug">“{moment.text}”</p>
            <p className="mt-1.5 text-sm text-foreground/80">
              {moment.song.title} <span className="text-muted-foreground">· {moment.song.artist}</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {moment.playlist ? `In “${moment.playlist}” · ` : ""}
              {moment.when}
            </p>
          </>
        ) : (
          <>
            <Skeleton className="h-4 w-56" />
            <Skeleton className="mt-3 h-6 w-64" />
            <Skeleton className="mt-2 h-4 w-40" />
          </>
        )}
      </div>

      {node.youSimilarity != null && hop.hopped ? <p className="-mt-1 text-sm text-muted-foreground">{Math.round(Math.max(0, node.youSimilarity) * 100)}% like you</p> : null}

      {node.far ? <p className="-mt-1 text-sm text-muted-foreground">Far from your usual neighborhood, but you share a song. Wander shows how you hear it differently.</p> : null}

      {traded > 0 ? (
        <p className="-mt-1 text-sm text-foreground/85">
          <span className={traded >= BOND_AT ? "font-medium text-primary" : "text-muted-foreground"}>
            {traded >= BOND_AT ? "Bonded" : "Trading"} · {traded} {traded === 1 ? "song" : "songs"}
          </span>
          {traded < BOND_AT ? <span className="text-muted-foreground"> · {BOND_AT - traded} more and your line glows</span> : null}{" "}
          <Link href={`/messages/${node.userId}`} className="underline underline-offset-4 hover:text-foreground">
            Open thread
          </Link>
        </p>
      ) : null}

      {hop.isCenter ? (
        <p className="text-sm text-muted-foreground">You&apos;re looking at their galaxy.</p>
      ) : hop.canHop ? (
        <Button variant="secondary" className="h-11" onClick={hop.onHop}>
          Explore {node.name}&apos;s galaxy
        </Button>
      ) : null}

      <div className="flex items-center gap-4">
        <Link href={`/messages/${node.userId}/swap`} className={cn(buttonVariants(), "h-11 flex-1")}>
          Send a song
        </Link>
        <Link href={`/people/${node.userId}/card`} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          What you share
        </Link>
      </div>
    </div>
  );
}

/** Your nearest stars by similarity, optionally within one cluster. */
function closestTo(meId: string, nodes: GalaxyNode[], edges: GalaxyEdge[], cluster: string | null, limit: number) {
  const byId = new Map(nodes.map((n) => [n.userId, n]));
  return edges
    .filter((e) => e.source === meId || e.target === meId)
    .map((e) => ({ node: byId.get(e.source === meId ? e.target : e.source), similarity: e.similarity }))
    .filter((c): c is { node: GalaxyNode; similarity: number } => !!c.node && !c.node.isMe && (!cluster || c.node.cluster === cluster))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

const HINT_KEY = "song-galaxy-hint-seen";
const BOND_KEY = "song-galaxy-bonds";

/** A one-time gesture hint that clears itself on first interaction or after a few seconds. */
function useFirstVisitHint() {
  const [visible, setVisible] = useState(false);
  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {}
  };
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(HINT_KEY) === "1";
    } catch {}
    if (seen) return;
    const show = setTimeout(() => setVisible(true), 1200);
    const hide = setTimeout(() => dismiss(), 7000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, []);
  return { visible, dismiss };
}
