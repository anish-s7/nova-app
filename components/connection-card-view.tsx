import Link from "next/link";
import { ArrowRight, Disc3, GitCompareArrows } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { ThemeTag } from "@/components/theme-tag";
import { buttonVariants } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import type { ConnectionCard, SharedEvidence, User } from "@/lib/types";
import { cn } from "@/lib/utils";

type Person = User & { cluster: string };

function EvidenceRow({ who, evidence }: { who: string; evidence: SharedEvidence }) {
  return (
    <div className="flex gap-3">
      <AlbumArt song={evidence.song} size={52} className="rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">
          {who} · <span className="text-foreground/90">{evidence.song.title}</span>
          <span className="text-muted-foreground"> by {evidence.song.artist}</span>
        </p>
        <p className="mt-1 text-pretty font-serif text-[15px] italic leading-snug text-foreground/90">{evidence.text}</p>
      </div>
    </div>
  );
}

export function ConnectionCardView({ card, me, other }: { card: ConnectionCard; me: Person; other: Person }) {
  const { sharedSongs, sharedArtists } = card.overlap;

  return (
    <div className="flex flex-col gap-4">
      <section className="starfield overflow-hidden rounded-3xl border border-white/10 p-6 text-center">
        <div className="flex items-center justify-center gap-4">
          <UserAvatar name="You" cluster={me.cluster} isMe size={60} ring />
          <span className="h-px w-12 bg-gradient-to-r from-transparent via-white/40 to-transparent" aria-hidden />
          <UserAvatar name={other.name} cluster={other.cluster} size={60} ring />
        </div>
        <p className="mt-5 text-4xl font-semibold tabular-nums tracking-tight">{sharedSongs}</p>
        <p className="text-sm text-muted-foreground">
          {sharedSongs === 1 ? "song" : "songs"} in common · {sharedArtists} {sharedArtists === 1 ? "artist" : "artists"}
        </p>
        <p className="mt-4 text-balance font-serif text-xl italic">
          {card.sharedMotivations.length > 1 ? `But ${card.sharedMotivations.length} of the same reasons.` : "But the same reason."}
        </p>
      </section>

      {card.sharedMotivations.map((s) => (
        <section key={s.motivation} className="rounded-3xl border border-white/10 bg-card/70 p-5" aria-label={`Shared reason: ${s.motivation}`}>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">You both listen for</p>
          <ThemeTag label={s.motivation} className="mt-2" />
          <div className="mt-4 flex flex-col gap-4 border-t border-white/5 pt-4">
            <EvidenceRow who="You" evidence={s.evidenceA} />
            <EvidenceRow who={other.name} evidence={s.evidenceB} />
          </div>
        </section>
      ))}

      <section className="rounded-3xl border border-dashed border-white/15 p-5" aria-labelledby="diff-heading">
        <h2 id="diff-heading" className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <GitCompareArrows className="size-3.5" aria-hidden />
          Where you differ
        </h2>
        <p className="mt-2 text-pretty font-medium">{card.meaningfulDifference.summary}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">You</dt>
            <dd className="mt-0.5 text-foreground/85">{card.meaningfulDifference.evidenceA}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{other.name}</dt>
            <dd className="mt-0.5 text-foreground/85">{card.meaningfulDifference.evidenceB}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="openers-heading">
        <h2 id="openers-heading" className="px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Say something
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

      <Link href={`/messages/${other.id}/swap`} className={cn(buttonVariants(), "h-12 rounded-full text-base")}>
        <Disc3 className="size-4" aria-hidden />
        Start with a Song Swap
      </Link>
    </div>
  );
}
