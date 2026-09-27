"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronDown } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { PreviewButton } from "@/components/preview-button";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { getClusterDetail } from "@/lib/api";
import { getCluster } from "@/lib/clusters";
import type { ClusterSong } from "@/lib/cluster-songs";
import { cn } from "@/lib/utils";

export const ago = (d: number) => (d <= 1 ? "today" : d < 7 ? `${d} days ago` : d < 14 ? "last week" : `${Math.round(d / 7)} weeks ago`);

/** One "why", opened up: the songs people bring to it and the words they put next to them. */
export function ClusterSheetContent({ clusterId }: { clusterId: string }) {
  const cluster = getCluster(clusterId);
  const { data } = useSWR(["cluster", clusterId], ([, id]) => getClusterDetail(id), { revalidateOnFocus: false });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3" style={{ "--tone": cluster.color } as CSSProperties}>
      <div className="border-l-2 pl-3" style={{ borderColor: cluster.color }}>
        <h2 className="font-serif text-xl italic leading-snug">{cluster.label}</h2>
        {data ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="tabular-nums text-foreground">{data.listeners}</span> {data.listeners === 1 ? "person" : "people"} here for{" "}
            <span className="tabular-nums text-foreground">{data.songCount}</span> {data.songCount === 1 ? "song" : "songs"}
            {data.newThisWeek ? (
              <>
                {" — "}
                <span className="text-[var(--tone)]">{data.newThisWeek} new this week</span>
              </>
            ) : null}
          </p>
        ) : (
          <Skeleton className="mt-1.5 h-4 w-48" />
        )}
      </div>

      <ul className="-mx-1 flex max-h-[52vh] flex-col overflow-y-auto px-1">
        {data
          ? data.songs.map((s) => (
              <SongRow key={s.song.id} entry={s} clusterId={clusterId} expanded={open === s.song.id} onToggle={() => setOpen(open === s.song.id ? null : s.song.id)} />
            ))
          : Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="size-12" />
                <Skeleton className="h-8 flex-1" />
              </li>
            ))}
      </ul>
    </div>
  );
}

function SongRow({ entry, clusterId, expanded, onToggle }: { entry: ClusterSong; clusterId: string; expanded: boolean; onToggle: () => void }) {
  const { song, listeners } = entry;
  return (
    <li className="border-b border-white/5 last:border-0">
      <div className="flex min-h-16 w-full items-center gap-2 py-2">
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <AlbumArt song={song} size={48} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold leading-tight">{song.title}</span>
            <span className="block truncate text-sm text-muted-foreground">{song.artist}</span>
            <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
              {entry.mine ? <span className="font-medium text-[var(--tone)]">yours too</span> : null}
              {entry.isNew ? <span className="rounded-sm bg-[color-mix(in_oklch,var(--tone)_18%,transparent)] px-1 text-foreground">new</span> : null}
              <span>{listeners.length === 1 ? "1 person" : `${listeners.length} people`}</span>
            </span>
          </span>
        </button>
        <PreviewButton song={song} />
        <button type="button" onClick={onToggle} aria-label={expanded ? "Collapse details" : "Expand details"} className="p-2 text-muted-foreground">
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
      </div>

      {expanded ? (
        <div className="pb-3 pl-1">
          {entry.meaning ? <p className="mb-2 text-xs italic text-muted-foreground">“{song.title}” {entry.meaning}</p> : null}
          <ListenerList listeners={listeners} cluster={clusterId} songId={song.id} />
        </div>
      ) : null}
    </li>
  );
}


function swapHref(userId: string, songId?: string, opener?: string) {
  const q = new URLSearchParams();
  if (songId) q.set("song", songId);
  if (opener) q.set("opener", opener);
  const qs = q.toString();
  return `/messages/${userId}/swap${qs ? `?${qs}` : ""}`;
}

/** Who has this song and what they say about it, each with a way to reach out about it. */
export function ListenerList({
  listeners,
  cluster,
  songId,
  opener,
}: {
  songId?: string;
  listeners: { id: string; name: string; isMe: boolean; reason: string; daysAgo: number; why?: string }[];
  cluster: string;
  /** A first message for this listener, prefilled in the composer. Only given where both whys are known. */
  opener?: (listener: { id: string; why?: string }) => string | undefined;
}) {
  const others = listeners.filter((l) => !l.isMe);
  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {listeners.map((l) => (
          <li key={l.id} className="flex items-start gap-2.5">
            <UserAvatar name={l.name} cluster={cluster} userId={l.id} isMe={l.isMe} size={30} />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">
                <span className="font-medium">{l.name}</span>
                {l.reason ? <span className="text-foreground/80"> · {l.reason}</span> : null}
              </p>
              <p className="text-[11px] text-muted-foreground">{l.daysAgo === 0 ? "added just now" : `added ${ago(l.daysAgo)}`}</p>
            </div>
            {l.isMe ? null : (
              <Link href={swapHref(l.id, songId, opener?.(l))} className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-8 shrink-0 px-3 text-xs")}>
                Say hi with a song
              </Link>
            )}
          </li>
        ))}
      </ul>
      {others.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Only you so far. Others who feel this way will land here.</p> : null}
    </>
  );
}
