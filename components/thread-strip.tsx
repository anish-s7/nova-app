import Link from "next/link";
import { AlbumArt } from "@/components/album-art";
import type { Thread } from "@/lib/thread";
import { cn } from "@/lib/utils";

const MAX_SHOWN = 6;

/** Everything two people have passed each other, as a row of covers that gets longer as you trade. */
export function ThreadStrip({ thread, name, userId }: { thread: Thread; name: string; userId: string }) {
  const { entries, turn, last } = thread;
  const shown = entries.slice(-MAX_SHOWN);
  const hidden = entries.length - shown.length;

  return (
    <section aria-label={`Your thread with ${name}`} className="mb-4 border border-white/10 bg-card/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-base italic">Your thread</h2>
        <p className="text-xs tabular-nums text-muted-foreground">{entries.length === 0 ? "no songs yet" : entries.length === 1 ? "1 song" : `${entries.length} songs`}</p>
      </div>

      {entries.length ? (
        <ul className="mt-2.5 flex items-center" aria-label="Songs traded">
          {hidden > 0 ? <li className="mr-2 text-xs tabular-nums text-muted-foreground">+{hidden}</li> : null}
          {shown.map((e, i) => (
            <li key={e.swapId} className={cn("-ml-2 first:ml-0", i === shown.length - 1 && "motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:fade-in")}>
              <AlbumArt song={e.song} size={40} className={cn("rounded-md ring-2", e.fromMe ? "ring-primary/70" : "ring-white/25")} />
              <span className="sr-only">
                {e.song.title}, from {e.fromMe ? "you" : name}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2.5 text-sm text-foreground/85">
        {turn === "mine" && last ? (
          <>
            <span className="font-medium text-primary">Your turn.</span> {name} sent {last.song.title}.
          </>
        ) : turn === "theirs" && last ? (
          <>Waiting on {name}. You sent {last.song.title}.</>
        ) : turn === "even" ? (
          <>All caught up. Send {name} another whenever.</>
        ) : (
          <>Start it: send {name} the first song.</>
        )}
      </p>

      {turn !== "theirs" ? (
        <Link
          href={turn === "mine" && last ? `/messages/${userId}/swap?replyTo=${last.swapId}` : `/messages/${userId}/swap`}
          className="mt-2.5 inline-flex min-h-10 items-center border border-primary/50 px-4 text-sm font-medium text-primary hover:bg-primary/10"
        >
          {turn === "mine" ? "Send one back" : turn === "even" ? "Send another" : "Send a song"}
        </Link>
      ) : null}
    </section>
  );
}
