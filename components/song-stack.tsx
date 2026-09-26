import { AlbumArt } from "@/components/album-art";
import type { Song } from "@/lib/types";

/** Overlapping covers as quiet proof of what two people share. Extra songs collapse into +N. */
export function SongStack({ songs, total, size = 28 }: { songs: Song[]; total?: number; size?: number }) {
  if (!songs.length) return null;
  const extra = (total ?? songs.length) - songs.length;
  return (
    <ul className="flex items-center" aria-label="Songs in common">
      {songs.map((s, i) => (
        <li key={s.id} className={i ? "-ml-2" : ""}>
          <AlbumArt song={s} size={size} className="rounded-md ring-2 ring-background" />
          <span className="sr-only">
            {s.title} by {s.artist}
          </span>
        </li>
      ))}
      {extra > 0 ? <li className="ml-1.5 text-xs tabular-nums text-muted-foreground">+{extra}</li> : null}
    </ul>
  );
}
