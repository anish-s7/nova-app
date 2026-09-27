"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BottomTabBar } from "./bottom-tab-bar";

export function TabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideTabs = /^\/messages\/[^/]+/.test(pathname);
  // Laptops: the tab bar floats over the page, so leave room under the content. The galaxy runs
  // underneath it on purpose (its own bottom controls lift above the capsule).
  const roomForCapsule = !hideTabs && !pathname.startsWith("/galaxy");
  return (
    <>
      <div className={cn("relative flex min-h-0 flex-1 flex-col", roomForCapsule && "lg:pb-24")}>{children}</div>
      {hideTabs ? null : <BottomTabBar />}
    </>
  );
}
