"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowRight, Disc3, GitCompareArrows } from "lucide-react";
import { animate, createTimeline, spring, splitText, stagger } from "animejs";
import { AlbumArt } from "@/components/album-art";
import { ThemeTag } from "@/components/theme-tag";
import { buttonVariants } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { useAnime } from "@/hooks/use-anime";
import { clusterForLabel, getCluster } from "@/lib/clusters";
import type { ConnectionCard, SharedEvidence, User } from "@/lib/types";
import { cn } from "@/lib/utils";

type Person = User & { cluster: string };

function EvidenceRow({ who, evidence }: { who: string; evidence: SharedEvidence }) {
  return (
    <div className="flex items-start gap-3">
      <AlbumArt song={evidence.song} size={40} className="rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">
          {who} · <span className="text-foreground/90">{evidence.song.title}</span>
          <span className="text-muted-foreground"> by {evidence.song.artist}</span>
        </p>
        <p className="mt-0.5 text-pretty text-sm leading-snug text-foreground/80">{evidence.text}</p>
      </div>
    </div>
  );
}

export function ConnectionCardView({ card, me, other }: { card: ConnectionCard; me: Person; other: Person }) {
  const { sharedSongs, sharedArtists } = card.overlap;
  const tone = getCluster(me.cluster).color;

  const root = useAnime<HTMLDivElement>((el) => {
    const { words } = splitText(el.querySelector("[data-verdict]")!, { words: { wrap: "clip" } });
    const tl = createTimeline({ defaults: { ease: "outQuart" } })
      .add("[data-avatar=me]", { translateX: [-28, 0], opacity: [0, 1], ease: spring({ bounce: 0.3, duration: 800 }) }, 0)
      .add("[data-avatar=other]", { translateX: [28, 0], opacity: [0, 1], ease: spring({ bounce: 0.3, duration: 800 }) }, 0)
      .add("[data-link]", { scaleX: [0, 1], opacity: [0, 1], duration: 600 }, 350)
      .add("[data-count]", { opacity: [0, 1], translateY: [8, 0], duration: 600 }, 600)
      .add(words, { translateY: ["110%", "0%"], duration: 800, delay: stagger(60), ease: "outExpo" }, 900)
      .add("[data-card-section]", { opacity: [0, 1], translateY: [16, 0], duration: 700, delay: stagger(110) }, 1100);
    animate("[data-spark]", { left: ["0%", "100%"], opacity: [0, 1, 1, 0], duration: 1800, delay: 1200, loop: true, loopDelay: 1600, ease: "inOutSine" });
    return () => tl.revert();
  });

  return (
    <div ref={root} className="flex flex-col gap-3">
      <section className="starfield overflow-hidden rounded-3xl border border-white/10 px-5 py-5 text-center">
        <div className="flex items-center justify-center gap-3">
          <span data-avatar="me">
            <UserAvatar name="You" cluster={me.cluster} isMe size={48} ring />
          </span>
          <span data-link className="relative h-px w-16 bg-gradient-to-r from-transparent via-white/40 to-transparent" aria-hidden>
            <span
              data-spark
              className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
              style={{ background: tone, boxShadow: `0 0 10px 3px ${tone}` }}
            />
          </span>
          <span data-avatar="other">
            <UserAvatar name={other.name} cluster={other.cluster} size={48} ring />
          </span>
        </div>
        <p data-count className="mt-4 text-3xl font-semibold tabular-nums tracking-tight">{sharedSongs}</p>
        <p data-count className="text-sm text-muted-foreground">
          {sharedSongs === 1 ? "song" : "songs"} in common · {sharedArtists} {sharedArtists === 1 ? "artist" : "artists"}
        </p>
        <p data-verdict className="mt-3 text-balance font-serif text-lg italic">
          {card.sharedMotivations.length > 1 ? `But ${card.sharedMotivations.length} of the same reasons.` : "But the same reason."}
        </p>
      </section>

      {card.sharedMotivations.map((s) => (
        <section key={s.motivation} data-card-section style={{ "--tone": clusterForLabel(s.motivation).color } as CSSProperties} className="surface rounded-3xl border border-white/10 bg-card/70 p-4" aria-label={`Shared reason: ${s.motivation}`}>
          <ThemeTag label={s.motivation} />
          <div className="mt-3 flex flex-col gap-3">
            <EvidenceRow who="You" evidence={s.evidenceA} />
            <EvidenceRow who={other.name} evidence={s.evidenceB} />
          </div>
        </section>
      ))}

      <section data-card-section className="rounded-3xl border border-dashed border-white/15 p-4" aria-labelledby="diff-heading">
        <h2 id="diff-heading" className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <GitCompareArrows className="size-3.5" aria-hidden />
          Where you differ
        </h2>
        <p className="mt-1.5 text-pretty text-sm font-medium">{card.meaningfulDifference.summary}</p>
        {card.meaningfulDifference.evidenceA || card.meaningfulDifference.evidenceB ? (
          <dl className="mt-2 grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-xs text-muted-foreground">You</dt>
              <dd className="mt-0.5 text-foreground/85">{card.meaningfulDifference.evidenceA}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{other.name}</dt>
              <dd className="mt-0.5 text-foreground/85">{card.meaningfulDifference.evidenceB}</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <section data-card-section aria-labelledby="openers-heading">
        <h2 id="openers-heading" className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Say something
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {card.suggestedOpeners.slice(0, 2).map((o) => (
            <li key={o}>
              <Link
                href={`/messages/${other.id}?draft=${encodeURIComponent(o)}`}
                className="flex min-h-11 items-center gap-3 rounded-2xl border border-white/10 bg-card/60 px-4 py-2.5 text-left transition-colors hover:border-primary/40"
              >
                <span className="flex-1 text-pretty text-sm italic">&ldquo;{o}&rdquo;</span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Link data-card-section href={`/messages/${other.id}/swap`} className={cn(buttonVariants(), "btn-glow h-12 rounded-full text-base")}>
        <Disc3 className="size-4" aria-hidden />
        Start with a Song Swap
      </Link>
    </div>
  );
}
