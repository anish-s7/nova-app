"use client";

import type { CSSProperties } from "react";
import { AlbumArt } from "@/components/album-art";
import { bridgeOpener, whySummary } from "@/lib/bridge-opener";
import { getCluster } from "@/lib/clusters";
import { getTheme, THEME_THRESHOLD } from "@/lib/themes";
import type { SongLayer, SongStar } from "@/lib/song-layer";
import { ListenerList } from "./cluster-sheet";

/** One song star, opened: what it means, the moments it belongs to, and everyone who has it. */
export function SongSheetContent({ star, layer, onAddYours }: { star: SongStar; layer: SongLayer; onAddYours: (songId: string) => void }) {
  const cluster = getCluster(star.cluster);
  const mine = star.listeners.some((l) => l.isMe);
  return (
    <div className="flex flex-col gap-3" style={{ "--tone": cluster.color } as CSSProperties}>
      <div className="flex items-center gap-3">
        <AlbumArt song={star.song} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold leading-tight">{star.song.title}</h2>
          <p className="truncate text-sm text-muted-foreground">{star.song.artist}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-[var(--tone)]" aria-hidden />
            {star.isBridge ? whySummary(star.whyCounts) : `${cluster.short} · ${star.listeners.length === 1 ? "1 person" : `${star.listeners.length} people`}`}
          </p>
          {star.isBridge ? <p className="mt-0.5 text-[11px] text-muted-foreground">A bridge: {star.listeners.length} people, more than one reason.</p> : null}
        </div>
      </div>

      <p className="border-l-2 pl-3 font-serif text-base italic leading-snug text-foreground/85" style={{ borderColor: cluster.color }}>
        “{star.song.title}” {star.meaning}
      </p>

      {star.themes.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Moments this song belongs to">
          {star.themes.map((id) => {
            const t = getTheme(id);
            const state = layer.themes.find((x) => x.theme.id === id);
            return (
              <li key={id} style={{ "--tone": t.color } as CSSProperties} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs">
                <span className="size-1.5 rounded-full bg-[var(--tone)]" aria-hidden />
                {t.label}
                {state && !state.formed ? <span className="text-muted-foreground">forming · {state.songIds.length}/{THEME_THRESHOLD}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="-mx-1 flex max-h-[34vh] flex-col gap-4 overflow-y-auto px-1">
        {(star.isBridge ? star.whyCounts.map((w) => w.id) : [star.cluster]).map((why) => {
          const group = star.isBridge ? star.listeners.filter((l) => l.why === why) : star.listeners;
          return (
            <section key={why} aria-label={star.isBridge ? getCluster(why).short : undefined}>
              {star.isBridge ? (
                <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <span className="size-1.5 rounded-full" style={{ background: getCluster(why).color }} aria-hidden />
                  {getCluster(why).label}
                </h3>
              ) : null}
              <ListenerList
                listeners={group}
                cluster={why}
                songId={star.id}
                opener={(l) => (l.why ? bridgeOpener({ title: star.song.title, mine: star.myWhy, theirs: l.why, iHaveIt: mine }) : undefined)}
              />
            </section>
          );
        })}
      </div>

      {mine ? null : (
        <button type="button" onClick={() => onAddYours(star.id)} className="min-h-11 border border-white/15 px-4 text-sm font-medium hover:bg-white/5">
          This one&apos;s mine too
        </button>
      )}
    </div>
  );
}
