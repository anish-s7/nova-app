"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Orbit, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/galaxy", label: "Galaxy", icon: Orbit, match: ["/galaxy"] },
  { href: "/connections", label: "Connections", icon: Users, match: ["/connections", "/people"] },
  { href: "/messages", label: "Messages", icon: MessageCircle, match: ["/messages"] },
  { href: "/me", label: "Profile", icon: User, match: ["/me"] },
];

/**
 * The app's main navigation. Phones: a frosted-glass bar docked at the bottom (translucent, blurred,
 * hairline edge), active tab marked by color and a small glowing dot. Laptops (lg): a floating glass
 * capsule centered near the bottom, so the page (the galaxy especially) runs underneath it.
 */
export function BottomTabBar() {
  const pathname = usePathname();
  const activeIndex = TABS.findIndex(({ match }) => match.some((m) => pathname.startsWith(m)));

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "relative z-20 shrink-0 border-t border-white/[0.06] bg-background/70 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150",
        "lg:absolute lg:bottom-5 lg:left-1/2 lg:-translate-x-1/2 lg:rounded-full lg:border lg:border-white/10 lg:bg-background/55 lg:px-2 lg:pb-0 lg:shadow-[0_12px_40px_-8px_rgba(0,0,0,0.6)]",
      )}
    >
      <ul className="flex lg:gap-1">
        {TABS.map(({ href, label, icon: Icon }, i) => {
          const active = i === activeIndex;
          return (
            <li key={href} className="flex-1 lg:flex-none">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex min-h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[10px] font-medium tracking-wide transition-colors",
                  "lg:min-h-12 lg:flex-row lg:gap-2 lg:rounded-full lg:px-4 lg:text-[13px] lg:tracking-normal",
                  active ? "text-foreground lg:bg-white/[0.08]" : "text-muted-foreground hover:text-foreground lg:hover:bg-white/[0.04]",
                )}
              >
                <Icon
                  className={cn("size-6 transition-transform duration-150 group-active:scale-90 lg:size-5", active && "text-primary")}
                  strokeWidth={active ? 2.1 : 1.6}
                  aria-hidden
                />
                <span>{label}</span>
                {/* Active marker: a small glowing dot above the icon on phones (the capsule's pill does it on laptops). */}
                <span
                  className={cn(
                    "absolute top-1 size-1 rounded-full bg-primary shadow-[0_0_8px_2px] shadow-primary/60 transition-opacity lg:hidden",
                    active ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
