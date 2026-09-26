"use client";

import Link from "next/link";
import { ArrowRight, Disc3, GitCompareArrows } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { buttonVariants } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { getCluster } from "@/lib/clusters";
import type { ContrastCard, User } from "@/lib/types";
import { cn } from "@/lib/utils";

type Person = User & { cluster: string };

/** Wander's card: one song you share, and how each of you feels it. The difference is the point. */
export function ContrastCardView({ card, me, other }: { card: ContrastCard; me: Person; other: Person }) {
  const tone = getCluster(me.cluster).color;

  return (
    <div className="flex flex-col gap-4">
      <section className="starfield overflow-hidden rounded-3xl border border-white/10 p-6 text-center">
        <div className="flex items-center justify-center gap-3">
          <UserAvatar name="You" cluster={me.cluster} isMe size={56} ring />
          <AlbumArt song={card.song} size={72} className="rounded-xl" />
          <UserAvatar name={other.name} cluster={other.cluster} size={56} ring />
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Same song</p>
        <p className="mt-1 text-balance font-serif text-xl italic">{card.song.title}</p>
        <p className="text-sm text-muted-foreground">{card.song.artist}</p>
        <p className="mt-3 text-pretty text-sm text-foreground/80">{card.sharedThread}</p>
      </section>

      <section className="grid grid-cols-2 gap-3" aria-label="How each of you feels it">
        <div className="surface rounded-3xl border border-white/10 bg-card/70 p-4" style={{ borderColor: tone }}>
          <p className="text-xs font-medium text-muted-foreground">You</p>
          <p className="mt-1.5 text-pretty font-serif text-[15px] italic leading-snug">{card.feelA}</p>
        </div>
        <div className="surface rounded-3xl border border-white/10 bg-card/70 p-4">
          <p className="text-xs font-medium text-muted-foreground">{other.name}</p>
          <p className="mt-1.5 text-pretty font-serif text-[15px] italic leading-snug">{card.feelB}</p>
        </div>
      </section>

      <section className="rounded-3xl border border-dashed border-white/15 p-5" aria-labelledby="contrast-heading">
        <h2 id="contrast-heading" className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <GitCompareArrows className="size-3.5" aria-hidden />
          How you differ
        </h2>
        <p className="mt-2 text-pretty font-medium">{card.difference}</p>
      </section>

      <section aria-labelledby="contrast-openers-heading">
        <h2 id="contrast-openers-heading" className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Ask about their side
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {card.suggestedOpeners.map((o) => (
            <li key={o}>
              <Link
                href={`/messages/${other.id}?draft=${encodeURIComponent(o)}`}
                className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 bg-card/60 px-4 py-3 text-left transition-colors hover:border-primary/40"
              >
                <span className="flex-1 text-pretty font-serif text-[15px] italic">&ldquo;{o}&rdquo;</span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-pretty text-sm text-muted-foreground">{card.swapPrompt}</p>
        <Link href={`/messages/${other.id}/swap`} className={cn(buttonVariants(), "btn-glow h-12 rounded-full text-base")}>
          <Disc3 className="size-4" aria-hidden />
          Start with a Song Swap
        </Link>
      </div>
    </div>
  );
}
