"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AudioLines, Check } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { EmptyState } from "@/components/empty-state";
import { MoodCircle, type Mood } from "@/components/mood-circle";
import { ScreenHeader } from "@/components/screen-header";
import { TagPicker } from "@/components/tag-picker";
import { Button, buttonVariants } from "@/components/ui/button";
import { saveSongs } from "@/lib/api";
import { setSession, useHydrated, useSession, type Feeling } from "@/lib/session";
import type { Tag } from "@/lib/tags";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Spotify imports bring ~24 songs; people describe their top few (README: "top 5"). */
const MAX_DESCRIBE = 5;

const EMPTY_FEELING: Feeling = { tags: [], valence: 0, energy: 0, placed: false };

export default function FeelPage() {
  const hydrated = useHydrated();
  const session = useSession();
  if (!hydrated) return <main className="flex-1" />;

  if (session.songs.length === 0) {
    return (
      <main className="flex flex-1 flex-col justify-center px-6">
        <EmptyState
          icon={AudioLines}
          title="No songs yet"
          body="Bring a few songs first, then tell us how each one feels."
          action={
            <Link href="/onboarding/pick" className={cn(buttonVariants(), "h-11 rounded-full px-6")}>
              Bring your music
            </Link>
          }
        />
      </main>
    );
  }

  if (!session.describe) return <ChooseSongs songs={session.songs} />;

  const songs = session.songs.filter((s) => session.describe!.includes(s.id));
  return <DescribeSongs songs={songs} feelings={session.feelings ?? {}} fromSpotify={session.source === "spotify"} />;
}

/** Spotify path only: pick which imported songs to describe. */
function ChooseSongs({ songs }: { songs: Song[] }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const full = chosen.length >= MAX_DESCRIBE;

  const toggle = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : full ? c : [...c, id]));

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        backHref="/onboarding/pick"
        title="Your top songs"
        trailing={
          <span className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
            <span className={cn("font-semibold", chosen.length > 0 ? "text-primary" : "text-foreground")}>{chosen.length}</span>/{MAX_DESCRIBE}
          </span>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <p className="mt-2 text-pretty text-muted-foreground">
          Choose up to {MAX_DESCRIBE} that mean the most to you. You&apos;ll tell us how each one feels.
        </p>
        <ul className="mt-5 grid grid-cols-3 gap-3" aria-label="Imported songs">
          {songs.map((song) => {
            const selected = chosen.includes(song.id);
            return (
              <li key={song.id}>
                <button
                  type="button"
                  onClick={() => toggle(song.id)}
                  aria-pressed={selected}
                  disabled={!selected && full}
                  className="relative w-full text-left disabled:opacity-40"
                >
                  <AlbumArt song={song} size={100} className={cn("rounded-xl", selected && "ring-2 ring-primary")} />
                  {selected ? (
                    <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                  ) : null}
                  <p className="mt-1.5 truncate text-xs font-medium">{song.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-white/5 bg-background/90 px-5 pb-6 pt-3 backdrop-blur">
        <Button className="h-12 w-full rounded-full text-base" disabled={chosen.length === 0} onClick={() => setSession({ describe: chosen })}>
          {chosen.length === 0 ? "Choose at least one" : `Describe ${chosen.length === 1 ? "this song" : `these ${chosen.length}`}`}
        </Button>
      </div>
    </main>
  );
}

/** One song at a time: 1–3 tags, then a point on the mood circle. */
function DescribeSongs({ songs, feelings, fromSpotify }: { songs: Song[]; feelings: Record<string, Feeling>; fromSpotify: boolean }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const song = songs[Math.min(index, songs.length - 1)];
  const feeling = feelings[song.id] ?? EMPTY_FEELING;
  const last = index >= songs.length - 1;
  const ready = feeling.tags.length > 0;

  const update = (patch: Partial<Feeling>) =>
    setSession((s) => ({ feelings: { ...s.feelings, [song.id]: { ...(s.feelings?.[song.id] ?? EMPTY_FEELING), ...patch } } }));

  const back = () => {
    if (index > 0) setIndex(index - 1);
    else if (fromSpotify) setSession({ describe: undefined });
    else router.push("/onboarding/pick");
  };

  const next = () => {
    if (!last) {
      setIndex(index + 1);
      return;
    }
    void saveSongs(); // runs while the reading screen plays; it waits for this to finish
    router.push("/onboarding/reading");
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        onBack={back}
        title="How do they feel?"
        trailing={
          <span className="text-sm tabular-nums text-muted-foreground">
            {index + 1}/{songs.length}
          </span>
        }
      />
      <div className="mx-5 flex gap-1.5" aria-hidden>
        {songs.map((s, i) => (
          <span key={s.id} className={cn("h-1 flex-1 rounded-full transition-colors", i < index ? "bg-primary" : i === index ? "bg-primary/60" : "bg-white/10")} />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <div key={song.id} className="motion-safe:animate-rise-in">
          <div className="mt-5 flex items-center gap-4">
            <AlbumArt song={song} size={72} className="rounded-xl" />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold leading-tight">{song.title}</p>
              <p className="truncate text-muted-foreground">{song.artist}</p>
            </div>
          </div>

          <div className="mt-6">
            <TagPicker value={feeling.tags} onChange={(tags: Tag[]) => update({ tags })} label={`Tags for ${song.title}`} />
          </div>

          <div className="mt-8">
            <MoodCircle
              value={{ valence: feeling.valence, energy: feeling.energy }}
              placed={feeling.placed}
              onChange={(mood: Mood) => update({ ...mood, placed: true })}
              label={`How ${song.title} makes you feel`}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 bg-background/90 px-5 pb-6 pt-3 backdrop-blur">
        <Button className="h-12 w-full rounded-full text-base" disabled={!ready} onClick={next}>
          {!ready ? "Pick at least one tag" : last ? "Read my music" : "Next song"}
        </Button>
        {ready && !feeling.placed ? <p className="mt-2 text-center text-xs text-muted-foreground">Tip: place the circle too. It&apos;s how we match you.</p> : null}
      </div>
    </main>
  );
}
