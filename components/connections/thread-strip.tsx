"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { animate, spring } from "animejs";
import { AlbumArt } from "@/components/common/album-art";
import { useAnime } from "@/hooks/use-anime";
import type { Thread } from "@/lib/thread";
import { cn } from "@/lib/utils";

const MAX_SHOWN = 5;

/**
 * Everything two people have passed each other, as a slim bar pinned under the chat header:
 * the covers traded so far and whose move it is. The "send one back" action lives on the
 * swap card itself; this bar only points at it.
 */
export function ThreadStrip({ thread, name, userId, onJumpToPending }: { thread: Thread; name: string; userId: string; onJumpToPending?: () => void }) {
  const { entries, turn, last } = thread;
  const shown = entries.slice(-MAX_SHOWN);
  const hidden = entries.length - shown.length;

  // A swap completing while you watch: the last two covers lean into each other. Skips the first render.
  const seen = useRef(entries.length);
  const root = useAnime<HTMLElement>(() => {
    const grew = entries.length > seen.current;
    seen.current = entries.length;
    if (!grew || turn !== "even" || shown.length < 2) return;
    animate("[data-cover]:nth-last-child(2)", { translateX: [0, 6, 0], duration: 700, ease: spring({ bounce: 0.5, duration: 700 }) });
    animate("[data-cover]:last-child", { translateX: [0, -6, 0], scale: [0.7, 1], duration: 700, ease: spring({ bounce: 0.5, duration: 700 }) });
    animate("[data-both-ways]", { opacity: [0, 1], translateY: [4, 0], duration: 500, delay: 250, ease: "outQuart" });
  }, [entries.length]);

  return (
    <section ref={root} aria-label={`Your thread with ${name}`} className="flex min-h-14 items-center gap-3 border-b border-white/[0.07] bg-background/80 px-4 py-2 backdrop-blur-xl lg:px-8">
      {entries.length ? (
        <ul className="flex shrink-0 items-center" aria-label={`${entries.length} ${entries.length === 1 ? "song" : "songs"} traded`}>
          {hidden > 0 ? <li className="mr-1.5 text-[11px] tabular-nums text-muted-foreground">+{hidden}</li> : null}
          {shown.map((e) => (
            <li key={e.swapId} data-cover className="-ml-2 first:ml-0">
              <AlbumArt song={e.song} size={30} className={cn("rounded-[4px] ring-2", e.fromMe ? "ring-primary/70" : "ring-white/25")} />
              <span className="sr-only">
                {e.song.title}, from {e.fromMe ? "you" : name}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="min-w-0 flex-1 text-sm leading-snug">
        {turn === "mine" && last ? (
          <>
            <span className="font-medium text-primary">Your turn.</span> <span className="text-foreground/80">{name} sent {last.song.title}.</span>
          </>
        ) : turn === "theirs" && last ? (
          <span className="text-muted-foreground">Waiting on {name} to send one back.</span>
        ) : turn === "even" ? (
          <span data-both-ways className="text-foreground/80">
            Swapped both ways. <span className="text-muted-foreground">Send another whenever.</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Start your thread with a song.</span>
        )}
      </p>

      {turn === "mine" && onJumpToPending ? (
        <button type="button" onClick={onJumpToPending} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-primary hover:bg-white/5">
          Jump to it
          <ArrowDown className="size-3.5" aria-hidden />
        </button>
      ) : turn === "even" || turn === "open" ? (
        <Link href={`/messages/${userId}/swap`} className="inline-flex min-h-8 shrink-0 items-center rounded-full bg-primary/15 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/25">
          {turn === "open" ? "Send a song" : "Send another"}
        </Link>
      ) : null}
    </section>
  );
}
