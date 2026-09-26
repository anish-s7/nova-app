"use client";

import { useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { CLUSTER_IDS, CLUSTERS } from "@/lib/clusters";
import { cn } from "@/lib/utils";

export function GalaxyLegend({ defaultOpen = false, className }: { defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("rounded-2xl border border-white/10 bg-background/70 backdrop-blur-md", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-xs font-medium text-muted-foreground"
      >
        <span className="flex -space-x-1" aria-hidden>
          {CLUSTER_IDS.map((id) => (
            <span key={id} className="size-2.5 rounded-full ring-2 ring-background" style={{ background: CLUSTERS[id].color }} />
          ))}
        </span>
        Why people listen
        <ChevronDown className={cn("ml-auto size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <ul className="space-y-1.5 px-3 pb-3">
          {CLUSTER_IDS.map((id) => (
            <li key={id} className="flex items-center gap-2 text-xs text-foreground/90" style={{ "--tone": CLUSTERS[id].color } as CSSProperties}>
              <span className="size-2 shrink-0 rounded-full bg-[var(--tone)] shadow-[0_0_8px_var(--tone)]" aria-hidden />
              {CLUSTERS[id].label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
