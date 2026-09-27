"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { animate, splitText, stagger } from "animejs";
import { LandingStarfield } from "@/components/landing-starfield";
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
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <LandingStarfield />
      <div className="sky-grain" />

      <div className="relative z-10 flex items-center justify-between px-6 pt-5 lg:px-12 lg:pt-8">
        <Logo />
        {demo ? <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-muted-foreground">Demo</span> : null}
      </div>

      <div ref={intro} className="relative z-10 mt-auto flex flex-col px-6 pb-8 pt-8 motion-safe:opacity-0 lg:max-w-xl lg:px-12 lg:pb-16">
        <h1 className="text-balance font-serif text-[2.6rem] font-light leading-[1.08] tracking-tight text-foreground lg:text-6xl">
          Someone out there
          <br />
          <span className="italic text-foreground/90">feels it too.</span>
        </h1>
        <p data-intro-rest className="mt-4 text-pretty leading-relaxed text-muted-foreground lg:text-lg">
          Find your people through the stories behind your favorite songs.
        </p>

        <div data-intro-rest className="mt-10">
          <Link href={authEnabled ? "/signup" : "/onboarding/pick"} className={cn(buttonVariants(), "btn-glow h-12 w-full rounded-full text-base")}>
            Find your constellation
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
