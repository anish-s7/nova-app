"use client";

import { useRef } from "react";
import Image from "next/image";
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
      <Image src="/nova-logo.png" alt="" width={301} height={215} className="h-6 w-auto shrink-0" priority aria-hidden />
      Nova
    </span>
  );
}
