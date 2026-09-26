"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ChevronLeft, Network } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { bridgeOpener, whySummary } from "@/lib/bridge-opener";
import { getCluster } from "@/lib/clusters";
import { getTheme, THEME_THRESHOLD } from "@/lib/themes";
import type { SongLayer, SongStar } from "@/lib/song-layer";
import { REASON_LABEL, reasonLine, songConnections, type ReasonKind, type SongConnection } from "@/lib/song-connections";
import { cn } from "@/lib/utils";
import { ListenerList } from "./cluster-sheet";

/** One song star, opened: what it means, the moments it belongs to, and everyone who has it. */
export function SongSheetContent({
  star,
  layer,
  connecting,
  onConnecting,
  onOpenSong,
  onAddYours,
}: {
  star: SongStar;
  layer: SongLayer;
  connecting: boolean;
  onConnecting: (on: boolean) => void;
  onOpenSong: (songId: string) => void;
  onAddYours: (songId: string) => void;
}) {
  const links = useMemo(() => songConnections(star, layer), [star, layer]);
  if (connecting) return <ConnectionsView star={star} links={links} onBack={() => onConnecting(false)} onOpenSong={onOpenSong} />;
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

      <button
        type="button"
        onClick={() => onConnecting(true)}
        className="flex min-h-11 items-center justify-center gap-2 border px-4 text-sm font-medium hover:bg-white/5"
        style={{ borderColor: cluster.color, color: cluster.color }}
      >
        <Network className="size-4" aria-hidden />
        See connections{links.length ? ` · ${links.length}` : ""}
      </button>

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

/** The songs this one links to, and why. The galaxy behind the sheet lights the same links. */
function ConnectionsView({ star, links, onBack, onOpenSong }: { star: SongStar; links: SongConnection[]; onBack: () => void; onOpenSong: (songId: string) => void }) {
  const [kind, setKind] = useState<ReasonKind | "all">("all");
  const kinds = (["listeners", "theme", "why", "mood"] as const).filter((k) => links.some((l) => l.reasons.some((r) => r.kind === k)));
  const shown = kind === "all" ? links : links.filter((l) => l.reasons.some((r) => r.kind === kind));
  const top = links[0]?.score || 1;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} aria-label="Back to song" className="inline-flex size-10 items-center justify-center hover:bg-white/5">
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">Connected to {star.song.title}</h2>
      </div>

      {kinds.length > 1 ? (
        <ul className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" aria-label="Filter connections">
          {(["all", ...kinds] as const).map((k) => (
            <li key={k} className="shrink-0">
              <button
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={cn("min-h-8 rounded-full border border-white/10 px-3 text-xs", kind === k ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5")}
              >
                {k === "all" ? "All" : REASON_LABEL[k]}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {shown.length ? (
        <ul className="-mx-1 flex max-h-[26vh] flex-col overflow-y-auto px-1">
          {shown.map(({ star: other, score, reasons }) => (
            <li key={other.id}>
              <button type="button" onClick={() => onOpenSong(other.id)} className="flex w-full items-center gap-3 py-2 text-left hover:bg-white/5">
                <AlbumArt song={other.song} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{other.song.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {other.song.artist} · {reasonLine(reasons[0]!)}
                    {reasons[0]!.kind === "mood" ? " (estimated from the songs)" : ""}
                    {reasons.length > 1 ? ` +${reasons.length - 1}` : ""}
                  </span>
                </span>
                <span className="h-1 w-10 shrink-0 bg-white/10" aria-hidden>
                  <span className="block h-full bg-foreground/70" style={{ width: `${Math.max(12, (score / top) * 100)}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-4 text-sm text-muted-foreground">{links.length ? "Nothing connects in this way." : "No other songs share this yet."}</p>
      )}
    </div>
  );
}
