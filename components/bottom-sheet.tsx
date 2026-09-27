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
  minimized = false,
  onToggleMinimized,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
  /** Let touches through to the scene behind, so the sheet can sit low while you look at it. */
  peek?: boolean;
  /** Slide the sheet down to a header strip so the scene behind is fully visible. Needs `onToggleMinimized` for the handle. */
  minimized?: boolean;
  onToggleMinimized?: () => void;
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
    // overflow-hidden: the closed panel is parked just below this box (translate-y-full). Without
    // clipping it paints over whatever sits beneath the page, e.g. the tab bar on Profile.
    <div className={cn("absolute inset-0 z-30 overflow-hidden", open && !peek && !minimized ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
      <div
        className={cn("absolute inset-0 bg-night/50 transition-opacity duration-300", open && !peek && !minimized ? "opacity-100" : "opacity-0")}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-0 bottom-0 border-t border-white/10 bg-popover px-5 pb-6 pt-3 outline-none transition-transform duration-300 ease-out lg:mx-auto lg:max-w-[640px] lg:border-x",
          open ? "pointer-events-auto" : "translate-y-full",
          open && !minimized && "translate-y-0",
          open && minimized && "translate-y-[calc(100%-4.75rem)]",
          className,
        )}
      >
        {onToggleMinimized ? (
          <button
            type="button"
            onClick={onToggleMinimized}
            aria-label={minimized ? "Expand" : "Minimize"}
            aria-expanded={!minimized}
            className="group -mt-3 mb-1 flex h-8 w-full items-center justify-center"
          >
            <span className="h-1 w-10 bg-white/20 group-hover:bg-white/40" aria-hidden />
          </button>
        ) : (
          <div className="mx-auto mb-4 h-1 w-10 bg-white/20" aria-hidden />
        )}
        {open ? children : null}
      </div>
    </div>
  );
}
