"use client";

import Link from "next/link";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";
import { animate, stagger } from "animejs";
import { OverlapBadge } from "@/components/overlap-badge";
import { ScreenHeader } from "@/components/screen-header";
import { SimilarityRing } from "@/components/similarity-ring";
import { ThemeTag } from "@/components/theme-tag";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { useAnime } from "@/hooks/use-anime";
import { getConnections } from "@/lib/api";
import { useSession } from "@/lib/session";

export default function ConnectionsPage() {
  const { version } = useSession();
  const { data, error, mutate } = useSWR(["connections", version], getConnections);
  const list = useAnime<HTMLUListElement>(() => {
    animate("li", { opacity: [0, 1], translateY: [14, 0], duration: 600, delay: stagger(55), ease: "outQuart" });
    animate("[data-ring]", {
      strokeDashoffset: (el?: unknown) => [Number((el as Element).getAttribute("data-ring")), 0],
      duration: 1100,
      delay: stagger(55, { start: 200 }),
      ease: "outExpo",
    });
  }, [!!data]);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Connections" subtitle="Ranked by why you listen, not what" />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-muted-foreground">Couldn&apos;t load your connections.</p>
            <Button variant="secondary" className="rounded-full" onClick={() => mutate()}>
              Try again
            </Button>
          </div>
        ) : !data ? (
          <ul className="mt-2 flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-24 rounded-2xl" />
              </li>
            ))}
          </ul>
        ) : (
          <ul ref={list} className="mt-2 flex flex-col gap-2">
            {data.map((c) => (
              <li key={c.user.id}>
                <Link href={`/people/${c.user.id}/card`} className="surface flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-card/60 p-4 transition-[background-color,border-color,translate] hover:-translate-y-px hover:border-white/15 hover:bg-card">
                  <SimilarityRing value={c.similarity} cluster={c.cluster} size={48}>
                    <UserAvatar name={c.user.name} cluster={c.cluster} size={48} />
                  </SimilarityRing>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-semibold">{c.user.name}</p>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{Math.round(c.similarity * 100)}% same why</span>
                    </div>
                    <ThemeTag label={c.sharedMotivation} size="sm" className="mt-1.5 max-w-full" />
                    <OverlapBadge sharedSongs={c.sharedSongs} sharedArtists={c.sharedArtists} variant="both" className="mt-1.5" />
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
