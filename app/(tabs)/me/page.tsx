"use client";

import Link from "next/link";
import { AudioLines, ListMusic, Orbit } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { EmptyState } from "@/components/empty-state";
import { MotivationCard } from "@/components/motivation-card";
import { ReasonSpectrum } from "@/components/reason-spectrum";
import { ScreenHeader } from "@/components/screen-header";
import { buttonVariants } from "@/components/ui/button";
import { effectiveSongs, useHydrated, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export default function MePage() {
  const hydrated = useHydrated();
  const session = useSession();
  if (!hydrated) return <main className="flex-1" />;

  const songs = effectiveSongs(session);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="You" subtitle={session.source === "spotify" ? "From your Spotify listening" : session.source === "manual" ? "From the songs you picked" : undefined} />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        {!session.analysis ? (
          <EmptyState
            icon={AudioLines}
            title="We haven't read your music yet"
            body="Bring a few songs and we'll show you why you listen."
            action={
              <Link href="/onboarding/music" className={cn(buttonVariants(), "h-11 rounded-full px-6")}>
                Bring your music
              </Link>
            }
          />
        ) : (
          <>
            <p className="mt-2 text-balance font-serif text-2xl italic leading-snug">{session.analysis.headline}</p>

            {session.motivations.some((m) => m.feedback !== "rejected") ? (
            <section className="surface mt-6 rounded-3xl border border-white/10 bg-card/50 p-5" aria-labelledby="mix-heading">
              <h2 id="mix-heading" className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your listening mix
              </h2>
              <ReasonSpectrum motivations={session.motivations} />
            </section>
            ) : null}

            <section className="mt-6" aria-labelledby="reasons-heading">
              <h2 id="reasons-heading" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your reasons
              </h2>
              <div className="mt-3 flex flex-col gap-3">
                {session.motivations.map((m) => (
                  <MotivationCard key={m.id} motivation={m} songs={songs} />
                ))}
              </div>
            </section>
          </>
        )}

        {songs.length ? (
          <section className="mt-8" aria-labelledby="songs-heading">
            <h2 id="songs-heading" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Your songs
            </h2>
            <ul className="no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5">
              {songs.slice(0, 12).map((s) => (
                <li key={s.id} className="w-20 shrink-0">
                  <AlbumArt song={s} size={80} className="rounded-xl" />
                  <p className="mt-1.5 truncate text-xs">{s.title}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-8 grid grid-cols-2 gap-2">
          <Link href="/onboarding/music" className={cn(buttonVariants({ variant: "secondary" }), "h-11 rounded-full")}>
            <ListMusic className="size-4" aria-hidden />
            Change music
          </Link>
          <Link href="/onboarding/reveal?replay=1" className={cn(buttonVariants({ variant: "secondary" }), "h-11 rounded-full")}>
            <Orbit className="size-4" aria-hidden />
            Replay reveal
          </Link>
        </div>
      </div>
    </main>
  );
}
