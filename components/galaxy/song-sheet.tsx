"use client";

import { useMemo, useState, type CSSProperties } from "react";
import useSWR from "swr";
import { Bookmark, Check, ChevronLeft, Network, Plus, X } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { PreviewButton } from "@/components/preview-button";
import { bridgeOpener, whySummary } from "@/lib/bridge-opener";
import { getCluster } from "@/lib/clusters";
import { getTheme, THEME_THRESHOLD } from "@/lib/themes";
import type { SongLayer, SongStar } from "@/lib/song-layer";
import { REASON_LABEL, reasonLine, songConnections, type ReasonKind, type SongConnection } from "@/lib/song-connections";
import { cn } from "@/lib/utils";
import { ListenerList } from "./cluster-sheet";
import { ClusterStar } from "@/components/cluster-star";
import { getDiscovery, REAL_DATA, sendDiscoveryFeedback } from "@/lib/api";
import type { DiscoveryMode, DiscoverySongDto } from "@/lib/discovery/types";
import { useSession } from "@/lib/session";

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
            <ClusterStar color="var(--tone)" size={10} />
            {star.isBridge ? whySummary(star.whyCounts) : `${cluster.short} · ${star.listeners.length === 1 ? "1 person" : `${star.listeners.length} people`}`}
          </p>
          {star.isBridge ? <p className="mt-0.5 text-[11px] text-muted-foreground">{star.listeners.length} people, here for more than one reason.</p> : null}
        </div>
        <PreviewButton song={star.song} />
      </div>

      {star.meaning ? (
        <p className="border-l-2 pl-3 font-serif text-base italic leading-snug text-foreground/85" style={{ borderColor: cluster.color }}>
          “{star.song.title}” {star.meaning}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => onConnecting(true)}
        className="flex min-h-11 items-center justify-center gap-2 border px-4 text-sm font-medium hover:bg-white/5"
        style={{ borderColor: cluster.color, color: cluster.color }}
      >
        <Network className="size-4" aria-hidden />
        {links.length ? `See how ${links.length === 1 ? "it connects" : `these ${links.length} connect`}` : "See connections"}
      </button>

      {star.themes.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Moments this song belongs to">
          {star.themes.map((id) => {
            const t = getTheme(id);
            const state = layer.themes.find((x) => x.theme.id === id);
            return (
              <li key={id} style={{ "--tone": t.color } as CSSProperties} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-xs">
                <ClusterStar color="var(--tone)" size={10} />
                {t.label}
                {state && !state.formed ? (
                  <span className="text-muted-foreground">
                    {THEME_THRESHOLD - state.songIds.length === 1 ? "one more to go" : `${THEME_THRESHOLD - state.songIds.length} more to go`}
                  </span>
                ) : null}
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
                  <ClusterStar color={getCluster(why).color} size={10} />
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

      {REAL_DATA ? <DiscoveryPanel anchorSongId={star.id} onAddMeaning={onAddYours} /> : null}

      {mine ? null : (
        <button type="button" onClick={() => onAddYours(star.id)} className="min-h-11 border border-white/15 px-4 text-sm font-medium hover:bg-white/5">
          This one&apos;s mine too
        </button>
      )}
    </div>
  );
}

function DiscoveryPanel({ anchorSongId, onAddMeaning }: { anchorSongId: string; onAddMeaning: (songId: string) => void }) {
  const session = useSession();
  const capabilities = useSWR<{ discovery: boolean }>("/api/capabilities", async (url: string) => {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error("Capabilities unavailable");
    return response.json() as Promise<{ discovery: boolean }>;
  }, { shouldRetryOnError: false });
  const [mode, setMode] = useState<DiscoveryMode>("close");
  const [serverVersion, setServerVersion] = useState("unknown");
  const [busy, setBusy] = useState<string | null>(null);
  const discovery = useSWR(
    capabilities.data?.discovery ? ["discovery", session.version, anchorSongId, mode, serverVersion] : null,
    () => getDiscovery(anchorSongId, mode),
    {
      keepPreviousData: false,
      onSuccess(data) {
        const next = `${data.snapshotId ?? "none"}:${data.feedbackRevision}`;
        if (serverVersion !== next) setServerVersion(next);
      },
    },
  );
  if (!capabilities.data?.discovery) return null;
  const songs = discovery.data?.songs ?? [];

  async function feedback(song: DiscoverySongDto, action: "save" | "dismiss") {
    setBusy(song.candidateId);
    try {
      await sendDiscoveryFeedback(song.candidateId, action);
      await discovery.mutate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-2 border-t border-white/10 pt-4" aria-labelledby="discover-from-song">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="discover-from-song" className="text-sm font-semibold">Discover from this song</h3>
          <p className="text-xs text-muted-foreground">Public-pick paths shaped by your private listening interests.</p>
        </div>
        <div className="flex border border-white/10 p-0.5" aria-label="Discovery distance">
          {(["close", "explore"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value); setServerVersion("unknown"); }} className={cn("min-h-7 px-2 text-[11px] capitalize", mode === value ? "bg-white/10 text-foreground" : "text-muted-foreground")}>{value}</button>
          ))}
        </div>
      </div>
      {discovery.isLoading ? <p className="py-4 text-sm text-muted-foreground">Following the public paths…</p> : null}
      {discovery.error ? <p className="py-4 text-sm text-muted-foreground">Discoveries aren&apos;t available right now.</p> : null}
      {!discovery.isLoading && !discovery.error && discovery.data?.status === "not_ready" ? <p className="py-4 text-sm text-muted-foreground">Your first listening summary needs to finish before discoveries can branch from it.</p> : null}
      {!discovery.isLoading && discovery.data?.status === "ready" && songs.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No unfamiliar public picks connect here yet.</p> : null}
      {songs.length ? (
        <ul className="mt-3 space-y-1">
          {songs.slice(0, 5).map((item) => {
            const song = { id: item.song.id, title: item.song.title, artist: item.song.artist, albumArtUrl: item.song.albumArtUrl ?? undefined, spotifyId: item.song.spotifyId ?? undefined, source: item.song.spotifyId ? "spotify" as const : "manual" as const };
            return (
              <li key={item.candidateId} className="border border-white/10 p-3">
                <div className="flex items-center gap-3">
                  <AlbumArt song={song} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{song.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                  </div>
                  <PreviewButton song={song} />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-foreground/80">{item.reason}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{item.sourceAttribution}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" disabled={busy === item.candidateId || item.saved} onClick={() => void feedback(item, "save")} className="inline-flex min-h-8 items-center gap-1.5 border border-white/10 px-2.5 text-xs disabled:opacity-60">
                    {item.saved ? <Check className="size-3.5" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}{item.saved ? "Saved" : "Save"}
                  </button>
                  <button type="button" onClick={() => onAddMeaning(song.id)} className="inline-flex min-h-8 items-center gap-1.5 border border-white/10 px-2.5 text-xs"><Plus className="size-3.5" aria-hidden />Add meaning</button>
                  <button type="button" disabled={busy === item.candidateId} onClick={() => void feedback(item, "dismiss")} className="inline-flex min-h-8 items-center gap-1.5 px-2.5 text-xs text-muted-foreground"><X className="size-3.5" aria-hidden />Dismiss</button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
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
