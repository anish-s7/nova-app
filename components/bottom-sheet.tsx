"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BottomSheet({
  open,
  onClose,
  label,
  children,
  className,
  peek = false,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
  /** Let touches through to the scene behind, so the sheet can sit low while you look at it. */
  peek?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, onClose]);

  return (
    <div className={cn("absolute inset-0 z-30", open && !peek ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
      <div
        className={cn("absolute inset-0 bg-night/50 transition-opacity duration-300", open && !peek ? "opacity-100" : "opacity-0")}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-0 bottom-0 border-t border-white/10 bg-popover px-5 pb-6 pt-3 outline-none transition-transform duration-300 ease-out",
          open ? "pointer-events-auto translate-y-0" : "translate-y-full",
          className,
        )}
      >
        <div className="mx-auto mb-4 h-1 w-10 bg-white/20" aria-hidden />
        {open ? children : null}
      </div>
    </div>
  );
}
