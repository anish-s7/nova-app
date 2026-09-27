"use client";

import type { RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Orbit, User, Users } from "lucide-react";
import { useSlidingIndicator } from "@/hooks/use-sliding-indicator";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/galaxy", label: "Galaxy", icon: Orbit, match: ["/galaxy"] },
  { href: "/connections", label: "Connections", icon: Users, match: ["/connections", "/people"] },
  { href: "/messages", label: "Messages", icon: MessageCircle, match: ["/messages"] },
  { href: "/me", label: "Profile", icon: User, match: ["/me"] },
];

/**
 * The app's main navigation, frosted glass with a theme-tinted outline. Phones: docked at the
 * bottom. Laptops (lg): a floating capsule centered near the bottom (centered with auto margins,
 * not a transform, so the blur and the outline line up exactly), with the page running underneath.
 * The active tab's highlight glides to whatever you tap and carries a slowly moving gold/violet
 * outline (`duo-ring` in globals.css).
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const activeIndex = TABS.findIndex(({ match }) => match.some((m) => pathname.startsWith(m)));
  const { containerRef, indicatorRef } = useSlidingIndicator(activeIndex);

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "relative z-20 shrink-0 border-t border-primary/20 bg-background/70 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150",
        "lg:absolute lg:inset-x-0 lg:bottom-5 lg:mx-auto lg:w-fit lg:overflow-hidden lg:rounded-full lg:border lg:border-primary/25 lg:bg-background/55 lg:p-1 lg:shadow-[0_12px_40px_-10px_rgba(0,0,0,0.6)]",
      )}
    >
      <ul ref={containerRef as RefObject<HTMLUListElement>} className="relative flex lg:gap-1">
        {/* The highlight: glides between tabs; its outline slowly travels around it. */}
        <span
          ref={indicatorRef as RefObject<HTMLSpanElement>}
          className="duo-ring pointer-events-none absolute left-0 top-0 rounded-2xl bg-white/[0.07] opacity-0 transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.3,0.7,0.2,1)] lg:rounded-full"
          aria-hidden
        />
        {TABS.map(({ href, label, icon: Icon }, i) => {
          const active = i === activeIndex;
          return (
            <li key={href} className="relative flex-1 lg:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-[3.75rem] items-center justify-center text-[10px] font-medium tracking-wide transition-colors lg:min-h-0 lg:text-[13px] lg:tracking-normal",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  data-indicator-active={active ? "true" : undefined}
                  className="flex flex-col items-center gap-0.5 rounded-2xl px-4 py-1.5 lg:flex-row lg:gap-2 lg:rounded-full lg:px-4 lg:py-2.5"
                >
                  <Icon
                    className={cn("size-6 transition-transform duration-150 group-active:scale-90 lg:size-5", active && "text-primary")}
                    strokeWidth={active ? 2.1 : 1.6}
                    aria-hidden
                  />
                  <span>{label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
