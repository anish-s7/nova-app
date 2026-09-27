"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { animate } from "animejs";
import { useReducedMotion } from "@/hooks/use-capabilities";
import { useHydrated, useSession } from "@/lib/session";

/**
 * Once someone has seen their reveal, onboarding is behind them — but the browser's
 * back button (or a stale bookmark) can still land on `/onboarding/*`. Rather than an
 * abrupt redirect, fade the stale screen out and hand off to the galaxy once it's gone.
 * `/onboarding/reveal` opts itself out: it has its own replay flow (`?replay=1`, from
 * "Replay your reveal" on the Me screen) and already guards its own redirect.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const pathname = usePathname();
  const { revealSeen } = useSession();
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);

  const stale = hydrated && revealSeen && pathname !== "/onboarding/reveal";

  useEffect(() => {
    if (!stale || leaving) return;
    setLeaving(true);
    if (reducedMotion || !root.current) {
      router.replace("/galaxy");
      return;
    }
    animate(root.current, {
      opacity: [1, 0],
      translateY: [0, -8],
      duration: 260,
      ease: "inOutQuad",
      onComplete: () => router.replace("/galaxy"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once when `stale` first flips true
  }, [stale]);

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}
