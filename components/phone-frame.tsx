"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Screens that use the whole window on a laptop; everything else sits in a centered column. */
const FULL_WIDTH = ["/galaxy"];
/** Scripted demos composed for a phone screen: they keep the phone frame at every size. */
const PHONE_ONLY = ["/pitch", "/sim", "/proto"];

const matches = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * The app's outer shell. Phones: edge to edge. Tablets and small windows (sm): a phone-shaped
 * frame. Laptops (lg+): the whole window, with the galaxy full width and every other screen in a
 * readable centered column (the screens are mobile-first single columns, so stretching them edge
 * to edge would look worse). The /pitch, /sim and prototype demos keep the phone frame everywhere.
 */
export function PhoneFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const phoneOnly = matches(pathname, PHONE_ONLY);
  const fullWidth = matches(pathname, FULL_WIDTH);

  return (
    <div className={cn("flex min-h-dvh w-full items-center justify-center sm:nebula sm:py-8", !phoneOnly && "lg:block lg:py-0")}>
      <div
        className={cn(
          "relative isolate flex h-dvh w-full flex-col overflow-hidden bg-background sm:h-[844px] sm:max-h-[calc(100dvh-4rem)] sm:w-[390px] sm:rounded-[2.75rem] sm:border sm:border-white/10 sm:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7),0_0_0_8px_oklch(1_0_0/0.02)]",
          !phoneOnly && "lg:h-dvh lg:max-h-none lg:w-full lg:rounded-none lg:border-0 lg:shadow-none",
        )}
      >
        <div
          className={cn(
            "relative flex min-h-0 w-full flex-1 flex-col",
            !phoneOnly && !fullWidth && "lg:mx-auto lg:max-w-[720px] lg:border-x lg:border-white/[0.06]",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
