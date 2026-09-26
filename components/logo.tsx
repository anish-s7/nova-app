"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { resetSession } from "@/lib/session";
import { resetWorld } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Long-press (700ms) is a hidden presenter reset back to a fresh welcome screen. */
export function Logo({ className }: { className?: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const start = () => {
    timer.current = setTimeout(() => {
      resetSession();
      resetWorld();
      navigator.vibrate?.(30);
      router.replace("/");
    }, 700);
  };
  const cancel = () => clearTimeout(timer.current);

  return (
    <span
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      className={cn("inline-flex select-none items-center gap-2 text-sm font-semibold tracking-wide text-foreground/90 [-webkit-touch-callout:none]", className)}
    >
      <span className="relative flex size-5 items-center justify-center" aria-hidden>
        <span className="absolute size-5 rounded-full bg-primary/20 blur-[3px]" />
        <span className="size-2 rounded-full bg-primary" />
      </span>
      Song Galaxy
    </span>
  );
}
