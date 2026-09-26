"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Check, Plus, Search, X } from "lucide-react";
import { ContextChip } from "@/components/context-chip";
import { ScreenHeader } from "@/components/screen-header";
import { SongTile } from "@/components/song-tile";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { chooseSongs, REAL_DATA, searchSongs } from "@/lib/api";
import { CONTEXT_TAGS } from "@/lib/clusters";
import { getSession } from "@/lib/session";
import type { ContextTag, Song } from "@/lib/types";
import { cn } from "@/lib/utils";

const MIN = 5;
const MAX = 10;

function initialPicks() {
  const s = getSession();
  if (s.source !== "manual") return { songs: [] as Song[], tags: {} as Record<string, ContextTag[]> };
  return { songs: s.songs, tags: Object.fromEntries(s.signals.map((g) => [g.songId, g.contextTags])) };
}

export default function PickSongsPage() {
  const router = useRouter();
  const [picks, setPicks] = useState(initialPicks);
  const [query, setQuery] = useState("");
  // Real mode searches the whole catalog over the network, so wait for a pause in typing.
  const deferred = useDebouncedValue(query, REAL_DATA ? 350 : 0).trim();
  const { data: results, isLoading, error: searchError } = useSWR(["songs", deferred], ([, q]) => searchSongs(q), { keepPreviousData: true });
  const searching = deferred.length >= (REAL_DATA ? 2 : 1);

  const count = picks.songs.length;
  const isPicked = (id: string) => picks.songs.some((s) => s.id === id);

  const toggleSong = (song: Song) =>
    setPicks((p) =>
      isPicked(song.id)
        ? { ...p, songs: p.songs.filter((s) => s.id !== song.id) }
        : p.songs.length >= MAX
          ? p
          : { ...p, songs: [...p.songs, { ...song, source: "manual" }] },
    );

  const toggleTag = (songId: string, tag: ContextTag) =>
    setPicks((p) => {
      const cur = p.tags[songId] ?? [];
      return { ...p, tags: { ...p.tags, [songId]: cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag] } };
    });

  const finish = () => {
    chooseSongs({
      source: "manual",
      songs: picks.songs,
      signals: picks.songs.map((s) => ({ songId: s.id, contextTags: picks.tags[s.id] ?? [] })),
    });
    router.push("/onboarding/feel");
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        backHref="/onboarding/music"
        title="Pick your songs"
        trailing={
          <span className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
            <span className={cn("font-semibold", count >= MIN ? "text-primary" : "text-foreground")}>{count}</span>/{MAX}
          </span>
        }
      />
      <div className="mx-5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${(count / MAX) * 100}%` }} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {count > 0 ? (
          <section className="mt-5" aria-labelledby="picks-heading">
            <h2 id="picks-heading" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Your picks · tap when you play them (optional)
            </h2>
            <ul className="mt-2 flex flex-col divide-y divide-white/5">
              {picks.songs.map((song) => (
                <li key={song.id} className="py-3">
                  <SongTile
                    song={song}
                    artSize={44}
                    trailing={
                      <button
                        type="button"
                        onClick={() => toggleSong(song)}
                        aria-label={`Remove ${song.title}`}
                        className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    }
                  />
                  <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5" role="group" aria-label={`When you play ${song.title}`}>
                    {CONTEXT_TAGS.map((t) => (
                      <ContextChip key={t.id} label={t.label} selected={(picks.tags[song.id] ?? []).includes(t.id)} onToggle={() => toggleTag(song.id, t.id)} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-5" aria-labelledby="search-heading">
          <h2 id="search-heading" className="sr-only">
            Search songs
          </h2>
          <label className="flex h-12 items-center gap-2 rounded-full border border-white/10 bg-card/60 px-4 focus-within:border-primary/60">
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

          <ul className={cn("mt-2 flex flex-col transition-opacity", isLoading && "opacity-60")} aria-busy={isLoading}>
            {(searching || !REAL_DATA ? (results ?? []) : []).map((song) => {
              const picked = isPicked(song.id);
              const full = !picked && count >= MAX;
              return (
                <li key={song.id}>
                  <button
                    type="button"
                    onClick={() => toggleSong(song)}
                    disabled={full}
                    aria-pressed={picked}
                    className="w-full rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5 disabled:opacity-40"
                  >
                    <SongTile
                      song={song}
                      artSize={44}
                      trailing={
                        <span className={cn("inline-flex size-8 items-center justify-center rounded-full border", picked ? "border-primary bg-primary text-primary-foreground" : "border-white/15 text-muted-foreground")}>
                          {picked ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
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
        </section>
      </div>

      <div className="border-t border-white/5 bg-background/90 px-5 pb-6 pt-3 backdrop-blur">
        <Button className="h-12 w-full rounded-full text-base" disabled={count < MIN} onClick={finish}>
          {count < MIN ? `Pick ${MIN - count} more` : "Next: how they feel"}
        </Button>
      </div>
    </main>
  );
}
