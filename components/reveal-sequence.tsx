"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { DemoSteps } from "@/components/demo-steps";
import { GalaxyCanvas, GalaxySkeleton } from "@/components/galaxy/galaxy-canvas";
import type { GalaxyApi } from "@/components/galaxy/types";
import { ThemeTag } from "@/components/theme-tag";
import { Button, buttonVariants } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { usePacer } from "@/hooks/use-pacer";
import { getGalaxy, ME_ID } from "@/lib/api";
import { setSession, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const CAPTIONS = ["This is you.", "And this is everyone, arranged by why they listen.", "", "", ""];

/** Screen 6: ignite me, pull back to the galaxy, fly to the top match, raise their card. */
export function RevealSequence() {
  const router = useRouter();
  const session = useSession();
  const { wait, advance } = usePacer(session.demo);
  const apiRef = useRef<GalaxyApi | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [step, setStep] = useState(0);

  const { data, error, mutate, isValidating } = useSWR(["galaxy", session.version], getGalaxy, { revalidateOnFocus: false });

  const match = data?.topMatchId ? data.nodes.find((n) => n.userId === data.topMatchId) : undefined;
  const edge = data?.edges.find((e) => (e.source === ME_ID && e.target === match?.userId) || (e.target === ME_ID && e.source === match?.userId));

  const finish = (to: string) => {
    setSession({ revealSeen: true });
    router.replace(to);
  };

  useEffect(() => {
    if (!data || !sceneReady) return;
    const api = apiRef.current;
    if (!api) return;
    let cancelled = false;
    (async () => {
      await api.igniteMe(1800);
      await wait(1400);
      if (cancelled) return;
      setStep(1);
      await api.pullBackToOverview(2800);
      await wait(1800);
      if (cancelled) return;
      if (!data.topMatchId) return finish("/galaxy");
      setStep(2);
      await api.flyTo(data.topMatchId, { duration: 2200, distance: 6 });
      if (cancelled) return;
      setStep(3);
      await wait(1800);
      if (cancelled) return;
      setStep(4);
      setSession({ revealSeen: true });
    })();
    return () => {
      cancelled = true;
    };
    // finish is stable in behavior; re-running on its identity would restart the sequence
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sceneReady, wait]);

  if (error) {
    return (
      <main className="starfield flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-2xl font-semibold tracking-tight">The galaxy didn&apos;t load.</p>
        <Button className="h-11 rounded-full px-6" disabled={isValidating} onClick={() => mutate()}>
          Try again
        </Button>
      </main>
    );
  }

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      {data && data.status === "ready" ? (
        <GalaxyCanvas nodes={data.nodes} edges={data.edges} apiRef={apiRef} initialPhase="dark" interactive={false} onReady={() => setSceneReady(true)} />
      ) : (
        <GalaxySkeleton label="Placing you in the galaxy…" />
      )}

      {step < 4 ? <button type="button" onClick={advance} aria-label="Continue" className="absolute inset-0 z-10 cursor-default focus-visible:outline-none" /> : null}

      <div className="pointer-events-none relative z-20 flex items-center justify-between px-5 pt-5">
        {session.demo ? <DemoSteps total={5} current={step} /> : <span />}
        <button type="button" onClick={() => finish("/galaxy")} className="pointer-events-auto min-h-11 rounded-full px-4 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground">
          Skip
        </button>
      </div>

      <div className="pointer-events-none relative z-20 mt-auto px-5 pb-8">
        {CAPTIONS[step] ? (
          <p key={step} className="mb-6 text-center text-2xl text-foreground/90 motion-safe:animate-rise-in font-semibold tracking-tight" aria-live="polite">
            {CAPTIONS[step]}
          </p>
        ) : null}

        {step >= 3 && match && edge ? (
          <section aria-live="polite" className="pointer-events-auto rounded-3xl border border-white/10 bg-background/85 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl motion-safe:animate-rise-in">
            <div className="flex items-center gap-3">
              <UserAvatar name={match.name} cluster={match.cluster} userId={match.userId} size={52} ring />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Your closest match</p>
                <h2 className="truncate text-2xl font-semibold">{match.name}</h2>
              </div>
            </div>
            <p className="mt-4 text-3xl font-semibold tabular-nums tracking-tight">
              {edge.sharedSongs} {edge.sharedSongs === 1 ? "song" : "songs"} in common
            </p>
            {/* Real mode only knows the shared reason once their Connection Card exists; don't show an empty tag. */}
            {edge.sharedMotivation ? (
              <div className={cn("transition-all duration-700", step >= 4 ? "mt-3 opacity-100" : "mt-0 h-0 overflow-hidden opacity-0")}>
                <p className="text-xl font-medium tracking-tight text-muted-foreground">You both listen for the same reason</p>
                <ThemeTag label={edge.sharedMotivation} className="mt-2" />
              </div>
            ) : null}
            {step >= 4 ? (
              <div className="mt-5 flex flex-col gap-2 motion-safe:animate-rise-in">
                <Link href={`/people/${match.userId}/card`} onClick={() => setSession({ revealSeen: true })} className={cn(buttonVariants(), "h-12 rounded-full text-base")}>
                  See what you share
                </Link>
                <Link href="/galaxy" className={cn(buttonVariants({ variant: "ghost" }), "h-11 rounded-full text-muted-foreground")}>
                  Explore the galaxy
                </Link>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
