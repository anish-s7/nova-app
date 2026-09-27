"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { REAL_DATA } from "@/lib/data-source";
import { setSession, useSession } from "@/lib/session";
import { BottomTabBar } from "./bottom-tab-bar";

export function TabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideTabs = /^\/messages\/[^/]+/.test(pathname);

  // Reaching a tab screen at all means onboarding is behind you, even in a fresh tab whose
  // sessionStorage never saw the reveal (real mode only: the mock world has no such account
  // to have gotten here signed in with). This is what onboarding/layout.tsx checks to keep
  // the back button from ever landing there again.
  const { revealSeen } = useSession();
  useEffect(() => {
    if (REAL_DATA && !revealSeen) setSession({ revealSeen: true });
  }, [revealSeen]);

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      {hideTabs ? null : <BottomTabBar />}
    </>
  );
}
