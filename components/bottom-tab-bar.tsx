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

export function BottomTabBar() {
  const pathname = usePathname();
  const activeIndex = TABS.findIndex(({ match }) => match.some((m) => pathname.startsWith(m)));

  return (
    <nav aria-label="Primary" className="relative z-20 shrink-0 border-t border-white/10 bg-background pb-[env(safe-area-inset-bottom)]">
      <ul className="flex">
        {TABS.map(({ href, label, icon: Icon }, i) => {
          const active = i === activeIndex;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 border-t-2 text-[11px] font-medium transition-colors",
                  active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
