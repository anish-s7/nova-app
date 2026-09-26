"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function ContextChip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-3.5 text-sm transition-colors",
        selected ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
      )}
    >
      {selected ? <Check className="size-3.5" aria-hidden /> : null}
      {label}
    </button>
  );
}
