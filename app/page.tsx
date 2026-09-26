"use client";

import Link from "next/link";
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

export default function WelcomePage() {
  const { demo } = useSession();
  const intro = useAnime<HTMLDivElement>((el) => {
    const { words } = splitText(el.querySelector("h1")!, { words: { wrap: "clip" } });
    animate(el, { opacity: [0, 1], duration: 1 });
    animate(words, { translateY: ["110%", "0%"], duration: 900, delay: stagger(45, { start: 250 }), ease: "outExpo" });
    animate("[data-intro-rest]", { opacity: [0, 1], translateY: [12, 0], duration: 800, delay: stagger(140, { start: 900 }), ease: "outQuart" });
  });

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
          <Link href={authEnabled ? "/signup" : "/onboarding/music"} className={cn(buttonVariants(), "btn-glow h-12 w-full rounded-full text-base")}>
            Continue
            <ArrowRight className="size-4" aria-hidden />
          </Link>
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
    </main>
  );
}
