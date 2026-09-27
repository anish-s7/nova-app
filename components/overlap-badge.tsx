import { cn } from "@/lib/utils";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * What two people have in common, most specific first: the same songs; otherwise feelings they both
 * put on their songs (people are linked by how songs feel to them, so different songs are the
 * norm); otherwise shared artists; otherwise a gentle line instead of a row of zeros. Deliberately
 * quiet, so it contrasts with the shared-motivation tag.
 */
export function OverlapBadge({
  sharedSongs,
  sharedArtists,
  sharedFeelings = [],
  variant = "artists",
  className,
}: {
  sharedSongs: number;
  sharedArtists: number;
  /** Feeling tags on both people's songs (GalaxyEdge.sharedFeelings). */
  sharedFeelings?: string[];
  variant?: "artists" | "both";
  className?: string;
}) {
  const text =
    variant === "artists"
      ? sharedArtists
        ? plural(sharedArtists, "shared artist")
        : sharedFeelings.length
          ? `You both feel ${sharedFeelings.join(" · ")}`
          : "Close in how you listen"
      : sharedSongs
        ? `${plural(sharedSongs, "song")}${sharedArtists ? ` · ${plural(sharedArtists, "artist")}` : ""} in common`
        : sharedFeelings.length
          ? `You both feel ${sharedFeelings.join(" · ")}`
          : sharedArtists
            ? `${plural(sharedArtists, "artist")} in common`
            : "Close in how you listen";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground",
        className,
      )}
    >
      {text}
    </span>
  );
}
