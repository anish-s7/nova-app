"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { animate, splitText, stagger } from "animejs";
import { HeroConstellation } from "@/components/hero-constellation";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { useAnime } from "@/hooks/use-anime";
import { useSession } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

const authEnabled = isSupabaseConfigured();
const WELCOME_PLAYED_KEY = "song-galaxy-welcome-played";
const WELCOME_DURATION_MS = 2600;
let welcomePlayedInMemory = false;
let welcomeAudio: HTMLAudioElement | null = null;

function hasPlayedWelcome() {
  if (welcomePlayedInMemory) return true;
  try {
    return sessionStorage.getItem(WELCOME_PLAYED_KEY) === "1";
  } catch {
    return false;
  }
}

function markWelcomePlayed() {
  welcomePlayedInMemory = true;
  try {
    sessionStorage.setItem(WELCOME_PLAYED_KEY, "1");
  } catch {}
}

function playWelcomeAudio() {
  const audio = new Audio("/audio/song-galaxy-welcome.mp3");
  welcomeAudio = audio;
  const release = () => {
    if (welcomeAudio === audio) welcomeAudio = null;
  };
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  void audio.play().catch(release);
}

export default function WelcomePage() {
  const router = useRouter();
  const { demo } = useSession();
  const [welcoming, setWelcoming] = useState(false);
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intro = useAnime<HTMLDivElement>((el) => {
    const { words } = splitText(el.querySelector("h1")!, { words: { wrap: "clip" } });
    animate(el, { opacity: [0, 1], duration: 1 });
    animate(words, { translateY: ["110%", "0%"], duration: 900, delay: stagger(45, { start: 250 }), ease: "outExpo" });
    animate("[data-intro-rest]", { opacity: [0, 1], translateY: [12, 0], duration: 800, delay: stagger(140, { start: 900 }), ease: "outQuart" });
  });

  useEffect(
    () => () => {
      if (navigationTimer.current) clearTimeout(navigationTimer.current);
    },
    [],
  );

  const start = () => {
    const destination = authEnabled ? "/signup" : "/onboarding/music";
    if (hasPlayedWelcome()) {
      router.push(destination);
      return;
    }

    markWelcomePlayed();
    setWelcoming(true);
    playWelcomeAudio();
    navigationTimer.current = setTimeout(
      () => router.push(destination),
      WELCOME_DURATION_MS,
    );
  };

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-6 pt-5">
        <Logo />
        {demo ? <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-muted-foreground">Demo</span> : null}
      </div>

      <HeroConstellation />

      <div ref={intro} className="flex flex-1 flex-col px-6 pb-8 pt-8 motion-safe:opacity-0">
        <h1 className="text-balance text-[32px] font-semibold leading-[1.12] tracking-tight">
          Two people. Zero songs in common.{" "}
          <span className="font-serif font-normal italic text-primary">The same reason.</span>
        </h1>
        <p data-intro-rest className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          Song Galaxy reads your music and finds people who use it the way you do, not people with the same playlist. You don&apos;t have to explain a thing.
        </p>

        <div data-intro-rest className="mt-auto pt-10">
<<<<<<< HEAD
          <button
            type="button"
            onClick={start}
            disabled={welcoming}
            className={cn(buttonVariants(), "btn-glow h-12 w-full rounded-full text-base")}
          >
=======
          <Link href={authEnabled ? "/signup" : "/onboarding/pick"} className={cn(buttonVariants(), "btn-glow h-12 w-full rounded-full text-base")}>
>>>>>>> main
            Continue
            <ArrowRight className="size-4" aria-hidden />
          </button>
          {authEnabled ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-foreground hover:text-primary">
                Log in
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      {welcoming ? (
        <div
          role="status"
          aria-live="polite"
          className="starfield absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-background/95 px-8 text-center backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700"
        >
          <div className="relative flex size-24 items-center justify-center" aria-hidden>
            <span className="absolute size-24 rounded-full border border-primary/15 motion-safe:animate-ping motion-reduce:opacity-40" />
            <span className="absolute size-16 rounded-full border border-primary/25 motion-safe:animate-pulse" />
            <span className="size-3 rounded-full bg-primary shadow-[0_0_28px_8px_rgba(244,192,96,0.35)]" />
          </div>
          <p className="mt-7 font-serif text-2xl italic text-foreground/90 motion-safe:animate-rise-in">
            Welcome to Song Galaxy
          </p>
          <p className="mt-2 text-sm text-muted-foreground motion-safe:animate-rise-in">
            Finding the meaning between the songs…
          </p>
        </div>
      ) : null}
    </main>
  );
}
