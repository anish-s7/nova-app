"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BottomTabBar } from "./bottom-tab-bar";

export function TabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Phones: an open chat takes the whole screen. Laptops keep the tab bar there too (Messages is
  // two panes, so there's always somewhere to go).
  const hideTabsOnPhones = /^\/messages\/[^/]+/.test(pathname);
  // Laptops: the tab bar floats over the page, so leave room under the content. The galaxy runs
  // underneath it on purpose (its own bottom controls sit in line with the capsule).
  const roomForCapsule = !pathname.startsWith("/galaxy");
  return (
    <>
      <div className={cn("relative flex min-h-0 flex-1 flex-col", roomForCapsule && "lg:pb-24")}>{children}</div>
      <div className={cn("contents", hideTabsOnPhones && "max-lg:hidden")}>
        <BottomTabBar />
      </div>
    </>
  );
}
