"use client";

import Link from "next/link";
import { ArrowRight, AudioLines } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Logo } from "@/components/logo";
import { MotivationCard } from "@/components/motivation-card";
import { ReachQuestion } from "@/components/reach-question";
import { buttonVariants } from "@/components/ui/button";
import { effectiveSongs, useHydrated, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export default function YourWhyPage() {
  const hydrated = useHydrated();
  const session = useSession();
  if (!hydrated) return <main className="flex-1" />;

  if (!session.analysis) {
    return (
      <main className="flex flex-1 flex-col justify-center px-6">
        <EmptyState
          icon={AudioLines}
          title="Nothing to read yet"
          body="Bring a few songs and we'll show you why you listen."
          action={
            <Link href="/onboarding/music" className={cn(buttonVariants(), "h-11 px-6")}>
              Bring your music
            </Link>
          }
        />
      </main>
    );
  }

  const songs = effectiveSongs(session);
  const kept = session.motivations.filter((m) => m.feedback !== "rejected").length;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <div className="pt-5">
          <Logo />
        </div>
        <p className="mt-8 text-xs font-medium uppercase tracking-wider text-muted-foreground">A first pass</p>
        <h1 className="mt-3 text-balance font-serif text-[30px] italic leading-[1.18] motion-safe:animate-rise-in">{session.analysis.headline}</h1>
        <p className="mt-4 text-sm text-muted-foreground">Correct anything that&apos;s off. One tap each.</p>

        <div className="mt-6 flex flex-col gap-3">
          {session.motivations.map((m, i) => (
            <div key={m.id} className="motion-safe:animate-rise-in" style={{ animationDelay: `${300 + i * 150}ms` }}>
              <MotivationCard motivation={m} songs={songs} />
            </div>
          ))}
        </div>

        <ReachQuestion className="mt-8 border-t border-white/10 pt-6" />
      </div>

      <div className="border-t border-white/5 bg-background/90 px-5 pb-6 pt-3 backdrop-blur">
        <Link
          href="/onboarding/reveal"
          aria-disabled={kept === 0}
          className={cn(buttonVariants(), "h-12 w-full text-base", kept === 0 && "pointer-events-none opacity-50")}
        >
          See who listens like you
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </main>
  );
}
