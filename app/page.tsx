"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { CLUSTERS } from "@/lib/clusters";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const STARS = [
  { x: 28, y: 38, c: CLUSTERS.quiet_company.color, s: 10 },
  { x: 72, y: 34, c: CLUSTERS.quiet_company.color, s: 10 },
  { x: 16, y: 70, c: CLUSTERS.armor_up.color, s: 5 },
  { x: 84, y: 66, c: CLUSTERS.carrying_loss.color, s: 6 },
  { x: 55, y: 80, c: CLUSTERS.somewhere_else.color, s: 4 },
  { x: 40, y: 16, c: CLUSTERS.old_selves.color, s: 4 },
];

export default function WelcomePage() {
  const { demo } = useSession();

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-6 pt-5">
        <Logo />
        {demo ? <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-muted-foreground">Demo</span> : null}
      </div>

      <div className="starfield relative mx-6 mt-6 h-52 shrink-0 overflow-hidden rounded-3xl" aria-hidden>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full">
          <line x1="28" y1="38" x2="72" y2="34" stroke={CLUSTERS.quiet_company.color} strokeOpacity="0.5" strokeWidth="0.4" strokeDasharray="1 1.4" vectorEffect="non-scaling-stroke" />
        </svg>
        {STARS.map((st, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full motion-safe:animate-drift-in"
            style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.s, height: st.s, background: st.c, boxShadow: `0 0 ${st.s * 2}px ${st.c}`, animationDelay: `${i * 140}ms` }}
          />
        ))}
        <span className="absolute left-[28%] top-[52%] -translate-x-1/2 text-[11px] text-muted-foreground">Phoebe Bridgers</span>
        <span className="absolute left-[72%] top-[48%] -translate-x-1/2 text-[11px] text-muted-foreground">Frank Ocean</span>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-8 pt-8">
        <h1 className="text-balance text-[32px] font-semibold leading-[1.12] tracking-tight">
          Two people. Zero songs in common.{" "}
          <span className="font-serif font-normal italic text-primary">The same reason.</span>
        </h1>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          Song Galaxy reads your music and finds people who use it the way you do, not people with the same playlist. You don&apos;t have to explain a thing.
        </p>

        <div className="mt-auto pt-10">
          <Link href="/onboarding/music" className={cn(buttonVariants(), "h-12 w-full rounded-full text-base")}>
            Continue
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </main>
  );
}
