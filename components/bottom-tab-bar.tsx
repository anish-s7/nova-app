"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Orbit, User, Users } from "lucide-react";
import { animate, spring, utils } from "animejs";
import { useReducedMotion } from "@/hooks/use-capabilities";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/galaxy", label: "Galaxy", icon: Orbit, match: ["/galaxy"] },
  { href: "/connections", label: "Connections", icon: Users, match: ["/connections", "/people"] },
  { href: "/messages", label: "Messages", icon: MessageCircle, match: ["/messages"] },
  { href: "/me", label: "Profile", icon: User, match: ["/me"] },
];

export function BottomTabBar() {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const activeIndex = TABS.findIndex(({ match }) => match.some((m) => pathname.startsWith(m)));
  const indicator = useRef<HTMLSpanElement>(null);
  const icons = useRef<(SVGSVGElement | null)[]>([]);
  const placed = useRef(false);

  useEffect(() => {
    const el = indicator.current;
    if (!el || activeIndex < 0) return;
    const x = `${activeIndex * 100}%`;
    // First placement (and reduced motion) jumps; after that the glow springs between tabs.
    if (!placed.current || reduced) {
      utils.set(el, { translateX: x, opacity: 1 });
      placed.current = true;
      return;
    }
    const slide = animate(el, { translateX: x, ease: spring({ bounce: 0.25, duration: 500 }) });
    const icon = icons.current[activeIndex];
    const pop = icon ? animate(icon, { scale: [0.82, 1], ease: spring({ bounce: 0.55, duration: 450 }) }) : undefined;
    return () => {
      slide.pause();
      pop?.pause();
    };
  }, [activeIndex, reduced]);

  return (
    <nav aria-label="Primary" className="relative z-20 shrink-0 border-t border-white/[0.07] bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <span aria-hidden className={cn("pointer-events-none absolute left-0 top-0 flex w-1/4 justify-center opacity-0", activeIndex < 0 && "hidden")} ref={indicator}>
        <span className="h-[2px] w-10 rounded-full bg-primary shadow-[0_0_12px_2px_color-mix(in_oklch,var(--primary)_60%,transparent)]" />
        <span className="absolute top-0 h-8 w-16 bg-[radial-gradient(50%_100%_at_50%_0%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)]" />
      </span>
      <ul className="flex">
        {TABS.map(({ href, label, icon: Icon }, i) => {
          const active = i === activeIndex;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  ref={(el) => {
                    icons.current[i] = el;
                  }}
                  className="size-[22px]"
                  strokeWidth={active ? 2.2 : 1.8}
                  aria-hidden
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
