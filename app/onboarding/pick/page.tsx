"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Check, Plus, Search, X } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { PreviewButton } from "@/components/preview-button";
import { ScreenHeader } from "@/components/screen-header";
import { SongTile } from "@/components/song-tile";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { chooseSongs, getMySongs, REAL_DATA, sameSong, searchSongs } from "@/lib/api";
import { stopPreview } from "@/lib/preview-player";
import { getSession, useHydrated } from "@/lib/session";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";

const MIN = 5;
const MAX = 10;

/**
 * Manual path: search and check the songs you reach for, like choosing from a Spotify import.
 * No tags here — how each song feels (tags + mood circle) is asked once, on the next step.
 */
export default function PickSongsPage() {
  // The picks-in-progress live in browser storage, so render only once it's loaded (no SSR mismatch).
  const hydrated = useHydrated();
  return hydrated ? <PickSongs /> : <main className="flex-1" />;
}

function PickSongs() {
  const router = useRouter();
  // Coming back from the feel step: keep this run's picks. A finished (saved) run starts fresh,
  // so "Add songs" from Profile doesn't resurrect old or removed songs.
  const [picked, setPicked] = useState<Song[]>(() => {
    const s = getSession();
    return s.source === "manual" && s.saveStatus !== "saved" ? s.songs : [];
  });
  const [query, setQuery] = useState("");
  // Real mode searches the whole catalog over the network, so wait for a pause in typing.
  const deferred = useDebouncedValue(query, REAL_DATA ? 350 : 0).trim();
  const { data: results, isLoading, error: searchError } = useSWR(["songs", deferred], ([, q]) => searchSongs(q), { keepPreviousData: true });
  const searching = deferred.length >= (REAL_DATA ? 2 : 1);
  const tray = useRef<HTMLUListElement>(null);
  // Songs you've already saved: marked in the list, and picking one again updates it instead of adding a copy.
  const { data: mine } = useSWR(["my-songs"], getMySongs);
  const yours = (song: Song) => mine?.some((m) => sameSong(m.song, song)) ?? false;
  // First time through you need a handful to be read; adding later, even one is fine.
  const min = mine?.length ? 1 : MIN;

  const count = picked.length;
  const full = count >= MAX;
  const isPicked = (id: string) => picked.some((s) => s.id === id);

  const toggle = (song: Song) =>
    setPicked((p) => (p.some((s) => s.id === song.id) ? p.filter((s) => s.id !== song.id) : p.length >= MAX ? p : [...p, { ...song, source: "manual" }]));

  // Leaving the screen stops any preview that's playing.
  useEffect(() => stopPreview, []);

  // Keep the newest pick in view in the tray.
  useEffect(() => {
    tray.current?.scrollTo({ left: tray.current.scrollWidth, behavior: "smooth" });
  }, [count]);

  const finish = () => {
    chooseSongs({ source: "manual", songs: picked, signals: picked.map((s) => ({ songId: s.id, contextTags: [] })) });
    router.push("/onboarding/feel");
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        backHref="/"
        title="Pick your songs"
        subtitle={mine?.length ? "Add songs, or pick one of yours to update it" : `Choose ${MIN} to ${MAX} you actually reach for`}
        trailing={
          <span className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
            <span className={cn("font-semibold", count >= min ? "text-primary" : "text-foreground")}>{count}</span>/{MAX}
          </span>
        }
      />
      <div className="mx-5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(count / MAX) * 100}%` }} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {/* Search stays put while you scroll the results. */}
        <div className="sticky top-0 z-10 -mx-5 bg-background px-5 pb-2 pt-4">
          <label className="flex h-12 items-center gap-2 rounded-full border border-white/10 bg-card px-4 focus-within:border-primary/60">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Search songs or artists</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs or artists"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>

        <ul className={cn("flex flex-col transition-opacity", isLoading && "opacity-60")} aria-busy={isLoading} aria-label="Songs">
          {(searching || !REAL_DATA ? (results ?? []) : []).map((song) => {
            const on = isPicked(song.id);
            return (
              <li key={song.id} className="flex items-center gap-1">
                {/* Real search results carry a ~30s clip; the button sits beside the pick button, not in it. */}
                {REAL_DATA ? <PreviewButton song={song} /> : null}
                <button
                  type="button"
                  onClick={() => toggle(song)}
                  disabled={!on && full}
                  aria-pressed={on}
                  className={cn("min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5 disabled:opacity-40", on && "bg-primary/[0.07]")}
                >
                  <SongTile
                    song={song}
                    artSize={44}
                    trailing={
                      <span className="flex shrink-0 items-center gap-2">
                        {yours(song) ? <span className="text-[11px] font-medium text-primary">Yours</span> : null}
                        <span className={cn("inline-flex size-8 items-center justify-center rounded-full border transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-white/15 text-muted-foreground")}>
                          {on ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                        </span>
                      </span>
                    }
                  />
                </button>
              </li>
            );
          })}
          {searchError ? (
            <li className="py-8 text-center text-sm text-muted-foreground">{searchError instanceof Error ? searchError.message : "Search isn't responding right now."}</li>
          ) : REAL_DATA && !searching ? (
            <li className="py-8 text-center text-sm text-muted-foreground">Search for any song or artist you actually reach for.</li>
          ) : results && results.length === 0 && searching && !isLoading ? (
            <li className="py-8 text-center text-sm text-muted-foreground">No songs match &ldquo;{deferred}&rdquo;.</li>
          ) : null}
        </ul>
      </div>

      <div className="border-t border-white/5 bg-background/90 px-5 pb-6 pt-3 backdrop-blur">
        {/* Fixed-height tray, so picking never moves anything on screen. */}
        <div className="mb-3 flex h-11 items-center">
          {count === 0 ? (
            <p className="text-sm text-muted-foreground">Tap songs to add them. You&apos;ll say how each one feels next.</p>
          ) : (
            <ul ref={tray} className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto" aria-label="Your picks">
              {picked.map((song) => (
                <li key={song.id} className="shrink-0 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-90">
                  <button type="button" onClick={() => toggle(song)} aria-label={`Remove ${song.title}`} className="group relative block">
                    <AlbumArt song={song} size={44} className="rounded-md" />
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-white/20 group-hover:text-foreground">
                      <X className="size-2.5" aria-hidden />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button className="h-12 w-full rounded-full text-base" disabled={count < min} onClick={finish}>
          {count < min ? (count === 0 ? "Pick a song" : `Pick ${min - count} more`) : "Next: how they feel"}
        </Button>
      </div>
    </main>
  );
}
