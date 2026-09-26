import Link from "next/link";
import { ArrowUpRight, Check, Clock, Disc3, Reply } from "lucide-react";
import type { Song, SongSwap } from "@/lib/types";
import { AlbumArt } from "./album-art";
import { cn } from "@/lib/utils";

/**
 * Opens the song on Spotify: the track itself when we have its id, a search otherwise. Just a
 * link, so no Spotify data is fetched or passed anywhere (see CLAUDE.md's Spotify rule).
 */
function listenUrl(song: Song) {
  return song.spotifyId ? `https://open.spotify.com/track/${song.spotifyId}` : `https://open.spotify.com/search/${encodeURIComponent(`${song.title} ${song.artist}`)}`;
}

export function SongSwapCard({
  swap,
  mine,
  otherName,
  otherId,
  preview = false,
  id,
}: {
  swap: SongSwap;
  mine: boolean;
  otherName: string;
  otherId: string;
  /** Composer preview: how the card will look to them, without actions. */
  preview?: boolean;
  id?: string;
}) {
  return (
    <article
      id={id}
      className={cn("w-[84%] scroll-mt-20 border border-white/10 bg-card/60 transition-shadow motion-safe:animate-in motion-safe:fade-in", preview && "w-full")}
      aria-label={`Song Swap from ${mine ? "you" : otherName}: ${swap.song.title}`}
    >
      <p className="flex items-center gap-1.5 px-4 pt-3 text-[11px] font-medium uppercase tracking-wider text-primary">
        <Disc3 className="size-3.5" aria-hidden />
        {mine ? (preview ? `Song Swap for ${otherName}` : "You sent a Song Swap") : `${otherName} sent a Song Swap`}
      </p>
      <div className="flex items-center gap-3 px-4 pt-3">
        <AlbumArt song={swap.song} size={60} className="rounded-md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{swap.song.title}</p>
          <p className="truncate text-sm text-muted-foreground">{swap.song.artist}</p>
          <a href={listenUrl(swap.song)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground">
            Listen on Spotify
            <ArrowUpRight className="size-3" aria-hidden />
          </a>
        </div>
      </div>
      <blockquote className="mx-4 mb-4 mt-3 border-l-2 border-primary/60 pl-3 font-serif text-[15px] italic leading-relaxed text-foreground/90">
        {swap.reason ? <>&ldquo;{swap.reason}&rdquo;</> : <span className="text-muted-foreground">Your reason shows here.</span>}
      </blockquote>
      {preview ? null : (
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
            <Link href={`/messages/${otherId}/swap?replyTo=${swap.id}`} className="flex min-h-12 items-center justify-center gap-2 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10">
              <Reply className="size-4" aria-hidden />
              Send one back
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
