import Image from "next/image";
import { Music } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Song } from "@/lib/types";

export function AlbumArt({ song, size = 48, className }: { song?: Song; size?: number; className?: string }) {
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-white/10", className)}
      style={{ width: size, height: size }}
    >
      {song?.albumArtUrl ? (
        <Image src={song.albumArtUrl} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <Music className="size-1/3" aria-hidden />
        </div>
      )}
    </div>
  );
}
