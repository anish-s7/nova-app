"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Clock, Disc3, Loader2, Pause, Play, Reply, VolumeX } from "lucide-react";
import type { SongSwap } from "@/lib/data/types";
import { AlbumArt } from "../common/album-art";
import { cn } from "@/lib/utils";
import { resolvePreviewUrl, stopPreview, stopPreviewIf, togglePreviewRange, usePreviewPlayback } from "@/lib/music/preview-player";

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

function SnippetPlayback({ swap }: { swap: SongSwap }) {
  const snippet = swap.snippet;
  const playbackId = `swap:${swap.id}`;
  const previewSongId = swap.song.id;
  const previewTitle = swap.song.title;
  const previewArtist = swap.song.artist;
  const hasSnippet = Boolean(snippet);
  const playback = usePreviewPlayback(playbackId);
  const [url, setUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(Boolean(snippet));
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    if (hasSnippet) {
      resolvePreviewUrl({ id: previewSongId, title: previewTitle, artist: previewArtist, source: "manual" }).then((fresh) => {
        if (!active) return;
        setUrl(fresh);
        setUnavailable(!fresh);
      }).catch(() => {
        if (active) setUnavailable(true);
      }).finally(() => {
        if (active) setResolving(false);
      });
    }
    return () => {
      active = false;
      stopPreviewIf(playbackId);
    };
  }, [hasSnippet, playbackId, previewArtist, previewSongId, previewTitle]);
  if (!snippet) return null;

  const toggle = async () => {
    if (playback.status === "playing") return stopPreview();
    let fresh = url;
    if (!fresh) {
      setResolving(true);
      fresh = await resolvePreviewUrl(swap.song).catch(() => null);
      setResolving(false);
      if (!fresh) return setUnavailable(true);
      setUrl(fresh);
    }
    await togglePreviewRange(playbackId, fresh, snippet.startSeconds, snippet.endSeconds);
  };

  return (
    <div className="mx-4 mt-3 rounded-2xl bg-black/15 px-3 py-2.5">
      {snippet.label ? <p className="mb-2 text-sm font-medium text-foreground/90">{snippet.label}</p> : null}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void toggle()} disabled={unavailable || resolving} className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-primary/40 text-primary disabled:border-white/10 disabled:text-muted-foreground" aria-label={playback.status === "playing" ? "Pause favorite snippet" : "Play favorite snippet"}>
          {resolving || playback.status === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : unavailable || playback.status === "error" ? <VolumeX className="size-4" aria-hidden /> : playback.status === "playing" ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex justify-between text-xs tabular-nums text-muted-foreground"><span>Favorite part</span><span>{formatTime(snippet.startSeconds)}–{formatTime(snippet.endSeconds)}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${playback.status === "playing" ? playback.progress * 100 : 0}%` }} /></div>
        </div>
      </div>
      {unavailable || playback.status === "error" ? <p className="mt-2 text-xs text-muted-foreground">This preview isn’t available right now.</p> : null}
    </div>
  );
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
      className={cn(
        "w-[84%] max-w-[380px] scroll-mt-24 overflow-hidden rounded-[22px] border transition-shadow motion-safe:animate-in motion-safe:fade-in",
        mine ? "border-primary/30 bg-primary/[0.08]" : "border-white/10 bg-[var(--bubble-theirs)]",
        preview && "w-full max-w-none",
      )}
      aria-label={`Song Swap from ${mine ? "you" : otherName}: ${swap.song.title}`}
    >
      <p className="flex items-center gap-1.5 px-4 pt-3.5 text-[13px] font-semibold text-primary">
        <Disc3 className="size-3.5" aria-hidden />
        {mine ? (preview ? `Song Swap for ${otherName}` : "You sent a Song Swap") : `${otherName} sent a Song Swap`}
      </p>
      <div className="flex items-center gap-3 px-4 pt-3">
        <AlbumArt song={swap.song} size={60} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-tight">{swap.song.title}</p>
          <p className="truncate text-sm text-muted-foreground">{swap.song.artist}</p>
        </div>
      </div>
      <SnippetPlayback swap={swap} />
      <p className="mx-4 mb-4 mt-3 text-[15px] leading-snug text-foreground/90">
        {swap.reason ? swap.reason : <span className="text-muted-foreground">Your reason shows here.</span>}
      </p>
      {preview ? null : (
        <div className="border-t border-white/[0.08]">
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
