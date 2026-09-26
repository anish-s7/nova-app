"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Hand, LocateFixed, Sparkles, X } from "lucide-react";
import { animate, stagger } from "animejs";
import { BottomSheet } from "@/components/bottom-sheet";
import { GalaxyCanvas, GalaxySkeleton } from "@/components/galaxy/galaxy-canvas";
import type { GalaxyApi } from "@/components/galaxy/types";
import { ClusterFilter } from "@/components/galaxy/cluster-filter";
import { Logo } from "@/components/logo";
import { OverlapBadge } from "@/components/overlap-badge";
import { SimilarityRing } from "@/components/similarity-ring";
import { ThemeTag } from "@/components/theme-tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { useAnime } from "@/hooks/use-anime";
import { useGalaxyRealtime } from "@/hooks/use-galaxy-realtime";
import { getGalaxy, getUser, ME_ID } from "@/lib/api";
import { getCluster } from "@/lib/clusters";
import { useSession } from "@/lib/session";
import type { GalaxyEdge, GalaxyNode } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function GalaxyPage() {
  const { version } = useSession();
  const { data, error, mutate, isValidating } = useSWR(["galaxy", version], getGalaxy, { revalidateOnFocus: false });
  const arrivals = useGalaxyRealtime(!!data);
  const apiRef = useRef<GalaxyApi | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedArrival, setDismissedArrival] = useState(false);
  const [focusCluster, setFocusCluster] = useState<string | null>(null);
  const hint = useFirstVisitHint();

  const nodes: GalaxyNode[] = data ? [...data.nodes, ...arrivals.map((a) => a.node)] : [];
  const edges: GalaxyEdge[] = data ? [...data.edges, ...arrivals.flatMap((a) => a.edges)] : [];
  const selected = nodes.find((n) => n.userId === selectedId);
  const arrival = arrivals[0]?.node;
  const closest = closestTo(ME_ID, nodes, edges, focusCluster, 6);

  const select = (id: string | null) => {
    setSelectedId(id);
    hint.dismiss();
    if (id) apiRef.current?.flyTo(id, { duration: 1200, distance: 18, lift: 0.1 });
  };

  const focus = (id: string | null) => {
    setFocusCluster(id);
    setSelectedId(null);
    hint.dismiss();
    apiRef.current?.flyToCluster(id);
  };

  const strip = useAnime<HTMLUListElement>(() => {
    animate("li", { opacity: [0, 1], translateY: [10, 0], duration: 500, delay: stagger(50, { start: 400 }), ease: "outQuart" });
  }, [closest.map((c) => c.node.userId).join()]);

  if (error) {
    return (
      <main className="starfield flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-serif text-2xl italic">The galaxy didn&apos;t load.</p>
        <Button className="h-11 rounded-full px-6" disabled={isValidating} onClick={() => mutate()}>
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
            nodes={data.nodes}
            edges={data.edges}
            arrivals={arrivals}
            apiRef={apiRef}
            selectedId={selectedId}
            onSelect={select}
            focusCluster={focusCluster}
          />
        </div>
      ) : (
        <GalaxySkeleton label="Arranging everyone by why they listen…" />
      )}

      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto rounded-full bg-background/60 px-3 py-2 backdrop-blur-md">
          <Logo />
        </div>
        {data ? (
          <p className="rounded-full bg-background/60 px-3 py-2 text-xs text-muted-foreground backdrop-blur-md">
            <span className="font-semibold tabular-nums text-foreground">{nodes.length - 1}</span> listeners
          </p>
        ) : null}
      </div>

      {data ? <ClusterFilter nodes={nodes} value={focusCluster} onChange={focus} className="relative z-10 -mt-1" /> : null}
      {focusCluster ? (
        <p key={focusCluster} className="relative z-10 mx-4 mt-2 text-pretty font-serif text-sm italic leading-snug motion-safe:animate-rise-in" style={{ color: getCluster(focusCluster).color }}>
          {getCluster(focusCluster).description}
        </p>
      ) : null}

      {arrival && !dismissedArrival ? (
        <div role="status" className="relative z-10 mx-4 mt-2 flex items-center gap-2 rounded-full border border-white/10 bg-background/80 py-1 pl-1 pr-1 backdrop-blur-md motion-safe:animate-rise-in">
          <UserAvatar name={arrival.name} cluster={arrival.cluster} size={32} />
          <button type="button" onClick={() => select(arrival.userId)} className="min-h-10 min-w-0 flex-1 truncate text-left text-sm">
            <span className="font-medium">{arrival.name}</span> <span className="text-muted-foreground">just joined, close to you</span>
          </button>
          <button type="button" onClick={() => setDismissedArrival(true)} aria-label="Dismiss" className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {hint.visible && data ? (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex justify-center motion-safe:animate-rise-in">
          <p className="flex items-center gap-2 rounded-full border border-white/10 bg-background/75 px-4 py-2 text-xs text-muted-foreground backdrop-blur-md">
            <Hand className="size-3.5 text-primary" aria-hidden />
            Drag to explore · pinch to zoom · tap a star
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none relative z-10 mt-auto flex items-end gap-2 p-4">
        {data ? (
          <section aria-labelledby="closest-heading" className="pointer-events-auto min-w-0 flex-1 rounded-3xl border border-white/10 bg-background/70 px-3 pb-2 pt-2.5 backdrop-blur-md">
            <h2 id="closest-heading" className="px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {focusCluster ? `Closest in ${getCluster(focusCluster).short.toLowerCase()}` : "Closest to you"}
            </h2>
            {closest.length === 0 ? (
              <p className="px-1 pb-1.5 pt-1 text-xs text-muted-foreground">Nobody here is close to you yet. Tap a star to meet them anyway.</p>
            ) : null}
            <ul ref={strip} className="no-scrollbar -mx-1 mt-1 flex gap-1 overflow-x-auto px-1">
              {closest.map(({ node, similarity }) => (
                <li key={node.userId} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => select(node.userId)}
                    aria-pressed={selectedId === node.userId}
                    aria-label={`${node.name}, ${Math.round(similarity * 100)}% same why`}
                    className={cn("flex w-14 flex-col items-center gap-0.5 rounded-2xl py-1 transition-colors hover:bg-white/5", selectedId === node.userId && "bg-white/[0.07]")}
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
            setFocusCluster(null);
            apiRef.current?.recenter();
          }}
          aria-label="Recenter on the whole galaxy"
          className="pointer-events-auto inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-background/70 backdrop-blur-md hover:bg-background"
        >
          <LocateFixed className="size-5" aria-hidden />
        </button>
      </div>

      <BottomSheet open={!!selected} onClose={() => setSelectedId(null)} label={selected ? `${selected.name}'s star` : "Star"}>
        {selected ? <StarPreview node={selected} /> : null}
      </BottomSheet>
    </main>
  );
}

function StarPreview({ node }: { node: GalaxyNode }) {
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
        <ul className="flex flex-wrap gap-2">
          {node.topMotivations.map((m) => (
            <li key={m} className="rounded-full border border-white/10 px-3 py-1 text-sm text-foreground/85">
              {m}
            </li>
          ))}
        </ul>
        <Link href="/me" className={cn(buttonVariants({ variant: "secondary" }), "h-11 rounded-full")}>
          Review your reasons
        </Link>
      </div>
    );
  }

  const edge = data?.edge;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <UserAvatar name={node.name} cluster={node.cluster} size={48} ring />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold">{node.name}</h2>
          {edge ? <OverlapBadge sharedSongs={edge.sharedSongs} sharedArtists={edge.sharedArtists} variant="both" className="mt-1" /> : <Skeleton className="mt-1 h-5 w-40" />}
        </div>
      </div>

      <div>
        <p className="font-serif text-lg italic text-muted-foreground">You listen for the same reason:</p>
        {edge ? <ThemeTag label={edge.sharedMotivation} className="mt-2" /> : <Skeleton className="mt-2 h-8 w-48 rounded-full" />}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link href={`/people/${node.userId}/card`} className={cn(buttonVariants(), "h-11 rounded-full")}>
          <Sparkles className="size-4" aria-hidden />
          What you share
        </Link>
        <Link href={`/people/${node.userId}`} className={cn(buttonVariants({ variant: "secondary" }), "h-11 rounded-full")}>
          Profile
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
