import { cn } from "@/lib/utils";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Song/artist overlap, deliberately quiet so it contrasts with the shared-motivation tag. */
export function OverlapBadge({
  sharedSongs,
  sharedArtists,
  variant = "artists",
  className,
}: {
  sharedSongs: number;
  sharedArtists: number;
  variant?: "artists" | "both";
  className?: string;
}) {
  const zero = variant === "artists" ? sharedArtists === 0 : sharedSongs === 0 && sharedArtists === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums",
        zero ? "border-white/15 text-foreground/85" : "border-white/10 text-muted-foreground",
        className,
      )}
    >
      {variant === "artists"
        ? `${plural(sharedArtists, "shared artist")}`
        : `${plural(sharedSongs, "song")} · ${plural(sharedArtists, "artist")} in common`}
    </span>
  );
}
