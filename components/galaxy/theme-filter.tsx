"use client";

import type { CSSProperties } from "react";
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
  return (
    <div role="group" aria-label="What the galaxy shows" className="flex border border-white/15 text-xs font-medium">
      {(["people", "songs"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          onClick={() => onChange(m)}
          className={cn("min-h-8 px-3 capitalize transition-colors", value === m ? "bg-white/12 text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
