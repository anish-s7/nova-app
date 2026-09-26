"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ListMusic, Loader2 } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { ScreenHeader } from "@/components/screen-header";
import { SpotifyIcon } from "@/components/spotify-icon";
import { Button, buttonVariants } from "@/components/ui/button";
import { saveSongs } from "@/lib/api";
import type { SpotifyImport } from "@/lib/types";
import { cn } from "@/lib/utils";

type Status =
  | { kind: "idle" }
  | { kind: "importing" }
  | { kind: "imported"; data: SpotifyImport }
  | { kind: "unavailable"; message: string };

const optionClass =
  "flex min-h-32 w-full flex-col items-start gap-3 rounded-3xl border border-white/10 bg-card/60 p-5 text-left transition-colors hover:border-white/20 hover:bg-card focus-visible:outline-2 disabled:opacity-60";

export default function BringYourMusicPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const connect = () => {
    window.location.href = "/api/spotify/connect";
  };

  const continueWithImport = async (data: SpotifyImport) => {
    await saveSongs({
      source: "spotify",
      songs: data.songs,
      signals: data.signals,
    });
    router.push("/onboarding/reading");
  };

  if (status.kind === "imported") {
    const { songs } = status.data;
    return (
      <main className="flex min-h-0 flex-1 flex-col">
        <ScreenHeader onBack={() => setStatus({ kind: "idle" })} />
        <div className="flex flex-1 flex-col px-6 pb-8">
          <span className="flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Check className="size-5" aria-hidden />
          </span>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            Imported {songs.length} songs
          </h1>
          <p className="mt-2 text-pretty text-muted-foreground">
            Your recent listening, including when and how often you play things.
            We look at when and how often you play things, not just the titles.
          </p>

          <ul
            className="no-scrollbar -mx-6 mt-8 flex gap-3 overflow-x-auto px-6 pb-2"
            aria-label="Imported songs"
          >
            {songs.map((s, i) => (
              <li
                key={s.id}
                className="w-24 shrink-0 motion-safe:animate-rise-in"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <AlbumArt song={s} size={96} className="rounded-xl" />
                <p className="mt-2 truncate text-xs font-medium">{s.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.artist}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-auto pt-10">
            <Button
              className="h-12 w-full rounded-full text-base"
              onClick={() => continueWithImport(status.data)}
            >
              Read my music
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const importing = status.kind === "importing";

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ScreenHeader backHref="/" />
      <div className="flex flex-1 flex-col px-6 pb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Bring your music
        </h1>
        <p className="mt-2 text-pretty text-muted-foreground">
          Either way works just as well. We only need a handful of songs you
          actually reach for.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={connect}
            disabled={importing}
            className={optionClass}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-[#1ed760]/15 text-[#1ed760]">
              {importing ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <SpotifyIcon className="size-5" />
              )}
            </span>
            <span>
              <span className="block text-lg font-semibold">
                {importing ? "Connecting to Spotify…" : "Connect Spotify"}
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                We look at your recent listening. Nothing gets posted.
              </span>
            </span>
          </button>

          <Link
            href="/onboarding/pick"
            className={optionClass}
            aria-disabled={importing}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary">
              <ListMusic className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-lg font-semibold">
                Pick your songs
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Choose 5 to 10 songs. Tap a few details if you like.
              </span>
            </span>
          </Link>
        </div>

        {status.kind === "unavailable" ? (
          <div
            role="alert"
            className="mt-5 flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <AlertCircle
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="font-medium">Spotify is unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {status.message} Picking your songs gives us everything we need.
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href="/onboarding/pick"
                  className={cn(
                    buttonVariants({ size: "sm" }),
                    "h-10 rounded-full px-4",
                  )}
                >
                  Pick my songs
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-10 rounded-full px-4"
                  onClick={connect}
                >
                  Try again
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
