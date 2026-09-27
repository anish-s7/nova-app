"use client";

import Link from "next/link";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { getWander } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * Wander: people who picked a song you did but feel it differently. Only mounts when the sheet
 * opens, so the (LLM-backed) lookup runs on an explicit tap and is reused if you reopen it.
 */
export function WanderSheetContent() {
  const { version } = useSession();
  const { data, error, mutate, isValidating } = useSWR(["wander", version], getWander, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
  });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-serif text-xl italic leading-snug">Same song, different feeling</h2>
        <p className="mt-1 text-xs text-muted-foreground">People who picked a song you did and hear it another way.</p>
      </div>

      {error ? (
        <div className="flex flex-col items-start gap-2 py-2">
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="secondary" className="h-10" disabled={isValidating} onClick={() => mutate()}>
            Try again
          </Button>
        </div>
      ) : !data ? (
        <div aria-busy="true" role="status">
          <p className="text-sm text-muted-foreground">Looking for someone who hears it differently…</p>
          <div className="mt-3 flex flex-col gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="mt-2 h-3 w-56" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : data.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          Nobody has picked one of your songs and felt it differently yet. Add another song, or check back as more people join.
        </p>
      ) : (
        <ul className="-mx-1 flex max-h-[52vh] flex-col overflow-y-auto px-1">
          {data.map(({ user, card }) => (
            <li key={user.id}>
              <Link href={`/people/${user.id}/contrast`} className="flex items-center gap-3 border-b border-white/5 py-3 hover:bg-white/[0.03]">
                <UserAvatar name={user.name} cluster={user.cluster} userId={user.id} size={44} ring />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {user.name} <span className="font-normal text-muted-foreground">· {card.song.title}</span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-pretty text-xs leading-snug text-foreground/80">{card.difference}</p>
                </div>
                <AlbumArt song={card.song} size={40} />
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
