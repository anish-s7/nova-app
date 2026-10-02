"use client";

import { Loader2, Pause, Play, VolumeX } from "lucide-react";
import { togglePreview, usePreview } from "@/lib/music/preview-player";
import type { Song } from "@/lib/data/types";
import { cn } from "@/lib/utils";

/** Play/pause a song's ~30s preview (lib/music/preview-player.ts). Only one plays at a time. */
export function PreviewButton({ song, className }: { song: Song; className?: string }) {
  const status = usePreview(song.id);
  const label =
    status === "playing" ? `Pause preview of ${song.title}` : status === "error" ? `No preview for ${song.title}` : `Play a preview of ${song.title}`;
  return (
    <button
      type="button"
      onClick={() => void togglePreview(song)}
      aria-label={label}
      title={status === "error" ? "No preview available" : undefined}
      aria-pressed={status === "playing"}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground",
        status === "playing" && "text-primary",
        className,
      )}
    >
      {status === "loading" ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : status === "playing" ? (
        <Pause className="size-4" aria-hidden />
      ) : status === "error" ? (
        <VolumeX className="size-4" aria-hidden />
      ) : (
        <Play className="size-4" aria-hidden />
      )}
    </button>
  );
}
