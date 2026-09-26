"use client";

import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Check, ExternalLink, Pause, Play, Plus, Search, X } from "lucide-react";
import { ContextChip } from "@/components/context-chip";
import { ScreenHeader } from "@/components/screen-header";
import { SongTile } from "@/components/song-tile";
import { Button } from "@/components/ui/button";
import { saveSongs, searchSongs } from "@/lib/api";
import { CONTEXT_TAGS } from "@/lib/clusters";
import { getSession } from "@/lib/session";
import type { SpotifyTopTrack } from "@/lib/spotify/client";
import {
  isSpotifyTrackId,
  isSpotifyTrackUrl,
  spotifyTrackUrl,
} from "@/lib/spotify/track";
import type { ContextTag, Song } from "@/lib/types";
import { cn } from "@/lib/utils";

const MIN = 5;
const MAX = 10;

type SpotifyStatus = "partial" | "no_history" | "error";

const SPOTIFY_NOTICES: Record<SpotifyStatus, string> = {
  partial: "We found a few songs from Spotify. Pick a few more to continue.",
  no_history:
    "We couldn't find enough Spotify listening history for this account. Pick 5 songs manually instead.",
  error:
    "Spotify hit a snag while importing your music. Pick 5 songs manually instead.",
};

function isSpotifyStatus(value: string | null): value is SpotifyStatus {
  return value === "partial" || value === "no_history" || value === "error";
}

function isSpotifyTopTrack(value: unknown): value is SpotifyTopTrack {
  if (!value || typeof value !== "object") return false;

  return (
    "name" in value &&
    typeof value.name === "string" &&
    "artist" in value &&
    typeof value.artist === "string" &&
    "spotifyTrackId" in value &&
    typeof value.spotifyTrackId === "string" &&
    "albumArtUrl" in value &&
    (typeof value.albumArtUrl === "string" || value.albumArtUrl === null) &&
    "previewUrl" in value &&
    (typeof value.previewUrl === "string" || value.previewUrl === null) &&
    "spotifyUrl" in value &&
    (typeof value.spotifyUrl === "string" || value.spotifyUrl === null)
  );
}

function songsFromSpotifyParam(rawTracks: string): Song[] {
  try {
    const tracks: unknown = JSON.parse(rawTracks);
    if (!Array.isArray(tracks)) return [];

    return tracks.filter(isSpotifyTopTrack).map((track) => ({
      id: track.spotifyTrackId,
      title: track.name,
      artist: track.artist,
      spotifyId: track.spotifyTrackId,
      albumArtUrl: track.albumArtUrl ?? undefined,
      previewUrl: track.previewUrl,
      spotifyUrl: track.spotifyUrl,
      source: "spotify",
    }));
  } catch {
    return [];
  }
}

function initialPicks() {
  const s = getSession();
  if (s.source !== "manual")
    return { songs: [] as Song[], tags: {} as Record<string, ContextTag[]> };
  return {
    songs: s.songs,
    tags: Object.fromEntries(s.signals.map((g) => [g.songId, g.contextTags])),
  };
}

export default function PickSongsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const spotifyStatusParam = searchParams.get("spotifyStatus");
  const spotifyNotice = isSpotifyStatus(spotifyStatusParam)
    ? SPOTIFY_NOTICES[spotifyStatusParam]
    : null;

  const [picks, setPicks] = useState(() => {
    const rawTracks = searchParams.get("tracks");

    if (rawTracks) {
      return {
        songs: songsFromSpotifyParam(rawTracks),
        tags: {},
      };
    }

    return initialPicks();
  });

  const [query, setQuery] = useState("");
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const deferred = useDeferredValue(query);
  const { data: results, isLoading } = useSWR(
    ["songs", deferred],
    ([, q]) => searchSongs(q),
    { keepPreviousData: true },
  );

  const count = picks.songs.length;
  const isPicked = (id: string) => picks.songs.some((s) => s.id === id);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (!audio) return;

      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    };
  }, []);

  const togglePreview = (event: MouseEvent<HTMLButtonElement>, song: Song) => {
    event.stopPropagation();
    if (!song.previewUrl) return;

    if (playingSongId === song.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingSongId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }

    const audio = new Audio(song.previewUrl);
    audioRef.current = audio;
    audio.onended = () => {
      if (audioRef.current === audio) {
        audioRef.current = null;
        setPlayingSongId(null);
      }
    };
    setPlayingSongId(song.id);

    void audio.play().catch(() => {
      if (audioRef.current === audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        audioRef.current = null;
        setPlayingSongId(null);
      }
    });
  };

  const spotifyControl = (song: Song) => {
    const importedTrackId =
      song.source === "spotify" && isSpotifyTrackId(song.spotifyId)
        ? song.spotifyId
        : null;
    const suppliedSpotifyUrl = isSpotifyTrackUrl(song.spotifyUrl)
      ? song.spotifyUrl
      : null;

    if (!importedTrackId && !suppliedSpotifyUrl) return null;

    if (song.previewUrl) {
      const isPlaying = playingSongId === song.id;
      return (
        <button
          type="button"
          onClick={(event) => togglePreview(event, song)}
          aria-label={`${isPlaying ? "Pause" : "Play"} preview of ${song.title}`}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 text-xs font-medium text-primary transition-colors hover:border-primary/70 hover:bg-primary/20"
        >
          {isPlaying ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4 fill-current" aria-hidden />
          )}
          {isPlaying ? "Pause" : "Play"}
        </button>
      );
    }

    const spotifyUrl = suppliedSpotifyUrl ?? spotifyTrackUrl(importedTrackId);

    if (spotifyUrl) {
      return (
        <a
          href={spotifyUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          aria-label={`Open ${song.title} in Spotify`}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#1ed760]/40 bg-[#1ed760]/10 px-3 text-xs font-medium text-[#1ed760] transition-colors hover:border-[#1ed760]/70 hover:bg-[#1ed760]/20"
        >
          <ExternalLink className="size-4" aria-hidden />
          Open in Spotify
        </a>
      );
    }

    return null;
  };

  const toggleSong = (song: Song) => {
    if (isPicked(song.id) && playingSongId === song.id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
      setPlayingSongId(null);
    }

    setPicks((p) =>
      isPicked(song.id)
        ? { ...p, songs: p.songs.filter((s) => s.id !== song.id) }
        : p.songs.length >= MAX
          ? p
          : { ...p, songs: [...p.songs, song] },
    );
  };

  const toggleTag = (songId: string, tag: ContextTag) =>
    setPicks((p) => {
      const cur = p.tags[songId] ?? [];
      return {
        ...p,
        tags: {
          ...p.tags,
          [songId]: cur.includes(tag)
            ? cur.filter((t) => t !== tag)
            : [...cur, tag],
        },
      };
    });

  const finish = async () => {
    await saveSongs({
      source: "manual",
      songs: picks.songs,
      signals: picks.songs.map((s) => ({
        songId: s.id,
        contextTags: picks.tags[s.id] ?? [],
      })),
    });
    router.push("/onboarding/reading");
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        backHref="/onboarding/music"
        title="Pick your songs"
        trailing={
          <span
            className="text-sm tabular-nums text-muted-foreground"
            aria-live="polite"
          >
            <span
              className={cn(
                "font-semibold",
                count >= MIN ? "text-primary" : "text-foreground",
              )}
            >
              {count}
            </span>
            /{MAX}
          </span>
        }
      />
      <div
        className="mx-5 h-1 overflow-hidden rounded-full bg-white/10"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${(count / MAX) * 100}%` }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {spotifyNotice ? (
          <p
            role="status"
            className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.08] px-4 py-3 text-sm text-muted-foreground"
          >
            {spotifyNotice}
          </p>
        ) : null}

        {count > 0 ? (
          <section className="mt-5" aria-labelledby="picks-heading">
            <h2
              id="picks-heading"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Your picks · tap when you play them (optional)
            </h2>
            <ul className="mt-2 flex flex-col divide-y divide-white/5">
              {picks.songs.map((song) => (
                <li key={song.id} className="py-3">
                  <SongTile
                    song={song}
                    artSize={44}
                    trailing={
                      <div className="flex items-center gap-1">
                        {spotifyControl(song)}
                        <button
                          type="button"
                          onClick={() => toggleSong(song)}
                          aria-label={`Remove ${song.title}`}
                          className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground"
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                      </div>
                    }
                  />
                  <div
                    className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5"
                    role="group"
                    aria-label={`When you play ${song.title}`}
                  >
                    {CONTEXT_TAGS.map((t) => (
                      <ContextChip
                        key={t.id}
                        label={t.label}
                        selected={(picks.tags[song.id] ?? []).includes(t.id)}
                        onToggle={() => toggleTag(song.id, t.id)}
                      />
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

          <ul
            className={cn(
              "mt-2 flex flex-col transition-opacity",
              isLoading && "opacity-60",
            )}
            aria-busy={isLoading}
          >
            {(results ?? []).map((song) => {
              const picked = isPicked(song.id);
              const full = !picked && count >= MAX;
              return (
                <li key={song.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleSong(song)}
                    disabled={full}
                    aria-pressed={picked}
                    className="min-w-0 flex-1 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5 disabled:opacity-40"
                  >
                    <SongTile
                      song={song}
                      artSize={44}
                      trailing={
                        <span
                          className={cn(
                            "inline-flex size-8 items-center justify-center rounded-full border",
                            picked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-white/15 text-muted-foreground",
                          )}
                        >
                          {picked ? (
                            <Check className="size-4" aria-hidden />
                          ) : (
                            <Plus className="size-4" aria-hidden />
                          )}
                        </span>
                      }
                    />
                  </button>
                  {spotifyControl(song)}
                </li>
              );
            })}
            {results && results.length === 0 ? (
              <li className="py-8 text-center text-sm text-muted-foreground">
                No songs match &ldquo;{deferred}&rdquo;.
              </li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="border-t border-white/5 bg-background/90 px-5 pb-6 pt-3 backdrop-blur">
        <Button
          className="h-12 w-full rounded-full text-base"
          disabled={count < MIN}
          onClick={finish}
        >
          {count < MIN ? `Pick ${MIN - count} more` : "Read my music"}
        </Button>
      </div>
    </main>
  );
}
