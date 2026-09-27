"use client";

import type { CSSProperties, RefObject } from "react";
import { useSlidingIndicator } from "@/hooks/use-sliding-indicator";
import { THEME_THRESHOLD } from "@/lib/themes";
import type { ThemeState } from "@/lib/song-layer";
import { cn } from "@/lib/utils";

/** Song-layer chips. Themes that haven't reached three songs are still forming: dashed, with how far they are. */
export function ThemeFilter({ themes, value, onChange, className }: { themes: ThemeState[]; value: string | null; onChange: (id: string | null) => void; className?: string }) {
  const chip = "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors";
  return (
    <div
      role="toolbar"
      aria-label="Highlight songs by moment"
      className={cn("no-scrollbar flex gap-1.5 overflow-x-auto pl-4 pr-10 [mask-image:linear-gradient(to_right,#000_calc(100%-40px),transparent)]", className)}
    >
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={cn(chip, value === null ? "border-white/30 bg-white/10 text-foreground" : "border-white/10 text-muted-foreground hover:text-foreground")}
      >
        All songs
      </button>
      {themes.map(({ theme, songIds, formed }) => {
        const on = value === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : theme.id)}
            style={{ "--tone": theme.color } as CSSProperties}
            className={cn(
              chip,
              !formed && "border-dashed",
              on
                ? "border-[color-mix(in_oklch,var(--tone)_60%,transparent)] bg-[color-mix(in_oklch,var(--tone)_14%,transparent)] text-foreground"
                : cn("text-foreground/80 hover:border-white/20", formed ? "border-white/10" : "border-white/20"),
            )}
          >
            <span className={cn("size-1.5 rounded-full", formed ? "bg-[var(--tone)]" : "border border-[var(--tone)]")} aria-hidden />
            {theme.short}
            <span className="tabular-nums text-muted-foreground">{formed ? songIds.length : `${songIds.length}/${THEME_THRESHOLD}`}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ModeToggle({ value, onChange }: { value: "people" | "songs"; onChange: (m: "people" | "songs") => void }) {
  // A rounded switch whose highlight glides to the side you pick.
  const { containerRef, indicatorRef } = useSlidingIndicator(value);
  return (
    <div
      ref={containerRef as RefObject<HTMLDivElement>}
      role="group"
      aria-label="What the galaxy shows"
      className="relative flex rounded-full border border-white/15 bg-background/40 p-0.5 text-xs font-medium backdrop-blur-md"
    >
      <span
        ref={indicatorRef as RefObject<HTMLSpanElement>}
        className="pointer-events-none absolute left-0 top-0 rounded-full bg-white/[0.14] opacity-0 transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.3,0.7,0.2,1)]"
        aria-hidden
      />
      {(["people", "songs"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          data-indicator-active={value === m ? "true" : undefined}
          onClick={() => onChange(m)}
          className={cn("relative min-h-8 rounded-full px-3.5 capitalize transition-colors", value === m ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
