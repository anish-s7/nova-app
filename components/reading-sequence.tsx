"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { AlbumArt } from "@/components/album-art";
import { DemoSteps } from "@/components/demo-steps";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { usePacer } from "@/hooks/use-pacer";
import { analyzeMusic } from "@/lib/api";
import { effectiveSongs, setSession, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const MAX_COVERS = 8;

/** Screen 4: covers drift in, pattern highlights surface one by one, everything converges into a point of light. */
export function ReadingSequence() {
  const router = useRouter();
  const session = useSession();
  const songs = effectiveSongs(session).slice(0, MAX_COVERS);
  const { wait, advance } = usePacer(session.demo);

  const { data, error, mutate, isValidating } = useSWR(
    ["analysis", session.version],
    () => analyzeMusic({ songs: effectiveSongs(session), signals: session.signals }),
    { revalidateOnFocus: false, revalidateIfStale: false, shouldRetryOnError: false },
  );

  // -1 covers only, 0..n-1 highlight index, n converge
  const [step, setStep] = useState(-1);
  const highlights = data?.highlights.slice(0, 3) ?? [];
  const converging = data ? step >= highlights.length : false;

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      await wait(2200);
      for (let i = 0; i < data.highlights.slice(0, 3).length; i++) {
        if (cancelled) return;
        setStep(i);
        await wait(2600);
      }
      if (cancelled) return;
      setStep(99);
      await new Promise((r) => setTimeout(r, 1800));
      if (cancelled) return;
      setSession({ analysis: data, motivations: data.motivations });
      router.replace("/onboarding/why");
    })();
    return () => {
      cancelled = true;
    };
  }, [data, wait, router]);

  if (error) {
    return (
      <main className="starfield flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="font-serif text-2xl italic">We couldn&apos;t read your music just now.</p>
        <p className="text-sm text-muted-foreground">Your songs are saved. Give it another try.</p>
        <Button className="mt-2 h-11 rounded-full px-6" disabled={isValidating} onClick={() => mutate()}>
          Try again
        </Button>
      </main>
    );
  }

  const currentHighlight = step >= 0 && step < highlights.length ? highlights[step] : undefined;
  const total = highlights.length + 2;
  const demoStep = !data ? 0 : step < 0 ? 0 : Math.min(step + 1, total - 1);

  return (
    <main className="starfield relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5">
        <Logo />
        {session.demo ? <DemoSteps total={total} current={demoStep} /> : null}
      </div>

      <button type="button" onClick={advance} aria-label="Continue" className="absolute inset-0 z-10 cursor-default focus-visible:outline-none" />

      <div className="relative flex-1" aria-hidden>
        {songs.map((song, i) => {
          const angle = (i / songs.length) * Math.PI * 2 - Math.PI / 2;
          const x = 50 + Math.cos(angle) * 34;
          const y = 42 + Math.sin(angle) * 28;
          return (
            <div
              key={song.id}
              className="absolute transition-[left,top,opacity,scale] duration-[1600ms] ease-[cubic-bezier(0.6,0,0.2,1)]"
              style={{
                left: converging ? "50%" : `${x}%`,
                top: converging ? "42%" : `${y}%`,
                opacity: converging ? 0 : 1,
                scale: converging ? 0.2 : 1,
                translate: "-50% -50%",
                transitionDelay: converging ? `${i * 40}ms` : "0ms",
              }}
            >
              <div className="motion-safe:animate-drift-in" style={{ animationDelay: `${i * 180}ms` }}>
                <AlbumArt song={song} size={i % 3 === 0 ? 72 : 60} className="rounded-xl shadow-lg shadow-black/40" />
              </div>
            </div>
          );
        })}

        <span
          className={cn(
            "absolute left-1/2 top-[42%] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary transition-all duration-[1400ms]",
            converging ? "scale-100 opacity-100 shadow-[0_0_40px_12px_var(--primary)]" : "scale-0 opacity-0",
          )}
        />
      </div>

      <div className="relative min-h-40 px-8 pb-16 text-center" aria-live="polite">
        {currentHighlight ? (
          <p key={currentHighlight} className="text-balance font-serif text-[26px] italic leading-snug motion-safe:animate-rise-in">
            {currentHighlight}
          </p>
        ) : converging ? (
          <p className="font-serif text-xl italic text-muted-foreground motion-safe:animate-rise-in">I think I see it.</p>
        ) : (
          <p className="text-sm text-muted-foreground">Reading your music…</p>
        )}
      </div>
    </main>
  );
}
