"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Check, Plus, Search, X } from "lucide-react";
import { AlbumArt } from "@/components/common/album-art";
import { PreviewButton } from "@/components/common/preview-button";
import { ScreenHeader } from "@/components/layout/screen-header";
import { SongTile } from "@/components/onboarding/song-tile";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ClusterStar } from "@/components/common/cluster-star";
import { chooseSongs, discoverSongs, getMySongs, REAL_DATA, sameSong, searchSongs } from "@/lib/data/api";
import { stopPreview } from "@/lib/music/preview-player";
import { getSession, useHydrated } from "@/lib/data/session";
import type { Song } from "@/lib/data/types";
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
  return hydrated ? <PickSongsGate /> : <main className="flex-1" />;
}

function PickSongsGate() {
  const router = useRouter();
  // Managing songs on purpose: Profile's links say so (?mode=manage), and so does an unfinished
  // selection in this browser (e.g. Back from the feel step mid-edit, whose links don't carry the mode).
  const session = getSession();
  const selecting = session.source === "manual" && session.saveStatus !== "saved" && session.songs.length > 0;
  const managing = new URLSearchParams(window.location.search).get("mode") === "manage" || selecting;
  const mine = useSWR(["my-songs"], getMySongs);
  const alreadyOnboarded = (mine.data?.length ?? 0) > 0;

  useEffect(() => {
    if (!managing && alreadyOnboarded) router.replace("/me");
  }, [alreadyOnboarded, managing, router]);

  if (mine.error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-xl font-semibold tracking-tight">We couldn&apos;t check your songs.</p>
        <Button className="h-11 rounded-full px-6" disabled={mine.isValidating} onClick={() => void mine.mutate()}>
          Try again
        </Button>
      </main>
    );
  }

  // Do not reveal the first-time picker until persisted picks have been checked. A replace redirect
  // also keeps the bare onboarding URL out of browser history for returning users. Waiting through
  // revalidation matters after browser Back: SWR may still have the pre-onboarding empty list cached.
  if (!mine.data || (!managing && (mine.isValidating || alreadyOnboarded))) return <main className="flex-1" />;

  return <PickSongs mine={mine.data} />;
}

function PickSongs({ mine }: { mine: Awaited<ReturnType<typeof getMySongs>> }) {
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
  // keepPreviousData: the current results stay up while the next search loads, instead of blanking.
  const search = useSWR(deferred ? ["songs", deferred] : null, ([, q]) => searchSongs(q), { keepPreviousData: true });
  // Nothing typed yet: suggestions, from what people here pick most (or the charts, early on).
  const discovery = useSWR(deferred ? null : ["discover"], discoverSongs, { revalidateOnFocus: false });
  const active = deferred ? search : discovery;
  const results = deferred ? search.data : discovery.data?.songs;
  const isLoading = active.isLoading;
  const searchError = active.error;
  const searching = deferred.length >= (REAL_DATA ? 2 : 1);
  const tray = useRef<HTMLUListElement>(null);
  // Songs you've already saved: marked in the list, and picking one again updates it instead of adding a copy.
  const yours = (song: Song) => mine.some((m) => sameSong(m.song, song));
  // First time through you need a handful to be read; adding later, even one is fine.
  const min = mine.length ? 1 : MIN;

  const count = picked.length;
  const full = count >= MAX;
  const isPicked = (song: Song) => picked.some((s) => sameSong(s, song));

  const toggle = (song: Song) =>
    setPicked((p) => (p.some((s) => sameSong(s, song)) ? p.filter((s) => !sameSong(s, song)) : p.length >= MAX ? p : [...p, { ...song, source: "manual" }]));

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
        subtitle={mine.length ? "Add songs, or pick one of yours to update it" : `Choose ${MIN} to ${MAX} you actually reach for`}
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

        {!deferred && discovery.data?.songs.length ? (
          <div className="px-1 pb-2 pt-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <ClusterStar color="var(--primary)" size={10} />
              {discovery.data.source === "community" ? "Popular on Nova" : "Trending now"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {discovery.data.source === "community"
                ? "What people here reach for most. Or search for any song."
                : "Not sure where to start? Pick something familiar, or search for any song."}
            </p>
          </div>
        ) : null}

        <ul className={cn("flex flex-col transition-opacity", isLoading && "opacity-60")} aria-busy={isLoading} aria-label={deferred ? "Search results" : "Songs to discover"}>
          {(!deferred || searching || !REAL_DATA ? (results ?? []) : []).map((song) => {
            const on = isPicked(song);
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
          ) : REAL_DATA && deferred.length === 1 ? (
            <li className="py-8 text-center text-sm text-muted-foreground">Type one more character to search.</li>
          ) : REAL_DATA && !deferred && isLoading ? (
            <li className="py-8 text-center text-sm text-muted-foreground">Finding a few familiar songs…</li>
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
