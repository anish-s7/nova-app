import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Song } from "@/lib/data/types";
import { AlbumArt } from "../common/album-art";

export function SongTile({
  song,
  artSize = 48,
  leading,
  trailing,
  className,
}: {
  song: Song;
  artSize?: number;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-14 items-center gap-3", className)}>
      {leading}
      <AlbumArt song={song} size={artSize} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight text-foreground">{song.title}</p>
        <p className="truncate text-sm text-muted-foreground">{song.artist}</p>
      </div>
      {trailing}
    </div>
  );
}
