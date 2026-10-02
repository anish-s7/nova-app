import Image from "next/image";
import { Music } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Song } from "@/lib/data/types";

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Muted enough to sit in the night palette; each song still gets its own. */
function tints(song: Song) {
  const h = hash(`${song.title}|${song.artist}`);
  const hue = h % 360;
  return {
    a: `oklch(0.42 0.09 ${hue})`,
    b: `oklch(0.26 0.06 ${(hue + 50) % 360})`,
    ink: `oklch(0.86 0.06 ${hue})`,
    grooves: 2 + ((h >>> 9) % 3),
    tilt: (h >>> 12) % 360,
  };
}

/** Real cover when we have one; otherwise a generated sleeve, so no song ever shows as an empty box. */
export function AlbumArt({ song, size = 48, className }: { song?: Song; size?: number; className?: string }) {
  const base = cn("relative shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-white/10", className);
  if (song?.albumArtUrl) {
    return (
      <div className={base} style={{ width: size, height: size }}>
        <Image src={song.albumArtUrl} alt="" fill sizes={`${size}px`} className="object-cover" />
      </div>
    );
  }
  if (!song) {
    return (
      <div className={base} style={{ width: size, height: size }}>
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <Music className="size-1/3" aria-hidden />
        </div>
      </div>
    );
  }

  const t = tints(song);
  const initial = song.title.replace(/^[^\p{L}\p{N}]+/u, "").charAt(0).toUpperCase() || "♪";
  return (
    <div className={base} style={{ width: size, height: size, background: `linear-gradient(${t.tilt}deg, ${t.a}, ${t.b})` }} aria-hidden>
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full">
        {Array.from({ length: t.grooves }, (_, i) => (
          <circle key={i} cx="28" cy="30" r={10 + i * 7} fill="none" stroke={t.ink} strokeOpacity={0.16 - i * 0.03} strokeWidth="0.6" />
        ))}
        <circle cx="28" cy="30" r="2" fill={t.ink} fillOpacity="0.5" />
      </svg>
      <span className="absolute left-[14%] top-[6%] font-serif italic leading-none" style={{ color: t.ink, fontSize: size * 0.46 }}>
        {initial}
      </span>
    </div>
  );
}
