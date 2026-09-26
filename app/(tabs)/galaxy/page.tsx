"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { LocateFixed, Sparkles, X } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { GalaxyCanvas, GalaxySkeleton } from "@/components/galaxy/galaxy-canvas";
import type { GalaxyApi } from "@/components/galaxy/types";
import { GalaxyLegend } from "@/components/galaxy-legend";
import { Logo } from "@/components/logo";
import { OverlapBadge } from "@/components/overlap-badge";
import { ThemeTag } from "@/components/theme-tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { useGalaxyRealtime } from "@/hooks/use-galaxy-realtime";
import { getGalaxy, getUser } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { GalaxyNode } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function GalaxyPage() {
  const { version } = useSession();
  const { data, error, mutate, isValidating } = useSWR(["galaxy", version], getGalaxy, { revalidateOnFocus: false });
  const arrivals = useGalaxyRealtime(!!data);
  const apiRef = useRef<GalaxyApi | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissedArrival, setDismissedArrival] = useState(false);

  const nodes: GalaxyNode[] = data ? [...data.nodes, ...arrivals.map((a) => a.node)] : [];
  const selected = nodes.find((n) => n.userId === selectedId);
  const arrival = arrivals[0]?.node;

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id) apiRef.current?.flyTo(id, { duration: 1200, distance: 9 });
  };

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
        <GalaxyCanvas nodes={data.nodes} edges={data.edges} arrivals={arrivals} apiRef={apiRef} selectedId={selectedId} onSelect={select} />
      ) : (
        <GalaxySkeleton label="Arranging everyone by why they listen…" />
      )}

      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto rounded-full bg-background/60 px-3 py-2 backdrop-blur-md">
          <Logo />
        </div>
        <GalaxyLegend className="pointer-events-auto w-48" />
      </div>

      {arrival && !dismissedArrival ? (
        <div role="status" className="relative z-10 mx-4 flex items-center gap-2 rounded-full border border-white/10 bg-background/80 py-1 pl-1 pr-1 backdrop-blur-md motion-safe:animate-rise-in">
          <UserAvatar name={arrival.name} cluster={arrival.cluster} size={32} />
          <button type="button" onClick={() => select(arrival.userId)} className="min-h-10 min-w-0 flex-1 truncate text-left text-sm">
            <span className="font-medium">{arrival.name}</span> <span className="text-muted-foreground">just joined, close to you</span>
          </button>
          <button type="button" onClick={() => setDismissedArrival(true)} aria-label="Dismiss" className="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      <div className="pointer-events-none relative z-10 mt-auto flex justify-end p-4">
        <button
          type="button"
          onClick={() => {
            setSelectedId(null);
            apiRef.current?.recenter();
          }}
          aria-label="Recenter on the whole galaxy"
          className="pointer-events-auto inline-flex size-12 items-center justify-center rounded-full border border-white/10 bg-background/70 backdrop-blur-md hover:bg-background"
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
