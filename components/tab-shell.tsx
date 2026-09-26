"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomTabBar } from "./bottom-tab-bar";

export function TabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideTabs = /^\/messages\/[^/]+/.test(pathname);
  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      {hideTabs ? null : <BottomTabBar />}
    </>
  );
}
