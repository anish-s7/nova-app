import Link from "next/link";
import { Check, Clock, Disc3, Reply } from "lucide-react";
import type { SongSwap } from "@/lib/types";
import { AlbumArt } from "./album-art";
import { cn } from "@/lib/utils";

export function SongSwapCard({ swap, mine, otherName, otherId }: { swap: SongSwap; mine: boolean; otherName: string; otherId: string }) {
  return (
    <article
      className={cn("w-[82%] overflow-hidden rounded-3xl bg-card ring-1 ring-white/[0.08] motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95", mine ? "rounded-br-lg" : "rounded-bl-lg")}
      aria-label={`Song Swap from ${mine ? "you" : otherName}: ${swap.song.title}`}
    >
      <p className="flex items-center gap-1.5 px-4 pt-3 text-xs font-medium text-primary">
        <Disc3 className="size-3.5" aria-hidden />
        {mine ? "You sent a Song Swap" : `${otherName} sent a Song Swap`}
      </p>
      <div className="flex items-center gap-3 px-4 pt-3">
        <AlbumArt song={swap.song} size={64} className="rounded-xl" />
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight">{swap.song.title}</p>
          <p className="truncate text-sm text-muted-foreground">{swap.song.artist}</p>
        </div>
      </div>
      <blockquote className="px-4 pb-4 pt-3 font-serif text-[15px] italic leading-relaxed text-foreground/90">&ldquo;{swap.reason}&rdquo;</blockquote>
      <div className="border-t border-white/[0.07]">
        {swap.status === "returned" ? (
          <p className="flex min-h-11 items-center gap-2 px-4 text-sm text-muted-foreground">
            <Check className="size-4" aria-hidden />
            Swapped both ways
          </p>
        ) : mine ? (
          <p className="flex min-h-11 items-center gap-2 px-4 text-sm text-muted-foreground">
            <Clock className="size-4" aria-hidden />
            Waiting for {otherName} to send one back
          </p>
        ) : (
          <Link href={`/messages/${otherId}/swap?replyTo=${swap.id}`} className="flex min-h-12 items-center justify-center gap-2 px-4 text-sm font-semibold text-primary transition-colors hover:bg-white/[0.04]">
            <Reply className="size-4" aria-hidden />
            Send one back
          </Link>
        )}
      </div>
    </article>
  );
}
