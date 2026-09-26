"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { MessageCircle, Sparkles } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { EvidenceLine } from "@/components/evidence-line";
import { OverlapBadge } from "@/components/overlap-badge";
import { ScreenHeader } from "@/components/screen-header";
import { ThemeTag } from "@/components/theme-tag";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { getUser } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user, error } = useSWR(["user", id], ([, uid]) => getUser(uid));

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader onBack={() => history.back()} title={user?.name} />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        {error ? (
          <p className="py-16 text-center text-muted-foreground">{error.message}</p>
        ) : !user ? (
          <div className="flex flex-col gap-4 pt-4" aria-busy="true">
            <Skeleton className="size-20 rounded-full" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-40 rounded-3xl" />
          </div>
        ) : (
          <>
            <section className="flex flex-col items-center pt-4 text-center">
              <UserAvatar name={user.name} cluster={user.cluster} size={84} ring />
              <h1 className="mt-3 text-2xl font-semibold">{user.name}</h1>
              <ThemeTag cluster={user.cluster} className="mt-2" />
              <OverlapBadge sharedSongs={user.edge.sharedSongs} sharedArtists={user.edge.sharedArtists} variant="both" className="mt-3" />
            </section>

            <div className="mt-6 grid grid-cols-2 gap-2">
              <Link href={`/people/${user.id}/card`} className={cn(buttonVariants(), "h-12 rounded-full")}>
                <Sparkles className="size-4" aria-hidden />
                What you share
              </Link>
              <Link href={`/messages/${user.id}`} className={cn(buttonVariants({ variant: "secondary" }), "h-12 rounded-full")}>
                <MessageCircle className="size-4" aria-hidden />
                Message
              </Link>
            </div>

            <section className="mt-8" aria-labelledby="why-heading">
              <h2 id="why-heading" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Why {user.name} listens
              </h2>
              <div className="mt-3 flex flex-col gap-3">
                {user.motivations.map((m) => (
                  <article key={m.id} className="rounded-3xl border border-white/10 bg-card/60 p-5">
                    <ThemeTag cluster={m.cluster} size="sm" short />
                    <h3 className="mt-3 text-lg font-semibold">{m.label}</h3>
                    <p className="mt-1 font-serif text-base italic text-foreground/85">{m.note ? `“${m.note}”` : m.description}</p>
                    <ul className="mt-4 flex flex-col gap-3 border-t border-white/5 pt-4">
                      {m.evidence.slice(0, 2).map((e, i) => (
                        <EvidenceLine key={i} evidence={e} songs={user.songs} />
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            </section>

            <section className="mt-8" aria-labelledby="songs-heading">
              <h2 id="songs-heading" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                On rotation
              </h2>
              <ul className="no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5">
                {user.songs.slice(0, 10).map((s) => (
                  <li key={s.id} className="w-24 shrink-0">
                    <AlbumArt song={s} size={96} className="rounded-xl" />
                    <p className="mt-2 truncate text-xs font-medium">{s.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{s.artist}</p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
