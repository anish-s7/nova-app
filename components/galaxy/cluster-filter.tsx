"use client";

import type { CSSProperties } from "react";
import { animate, stagger } from "animejs";
import { useAnime } from "@/hooks/use-anime";
import { CLUSTER_IDS, getCluster } from "@/lib/clusters";
import type { GalaxyNode } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The legend, made useful: each "why" is a chip that spotlights its part of the galaxy. */
export function ClusterFilter({ nodes, value, onChange, className }: { nodes: GalaxyNode[]; value: string | null; onChange: (id: string | null) => void; className?: string }) {
  const counts = new Map<string, number>();
  for (const n of nodes) if (!n.isMe) counts.set(n.cluster, (counts.get(n.cluster) ?? 0) + 1);
  const ids = CLUSTER_IDS.filter((id) => counts.has(id));

  const root = useAnime<HTMLDivElement>(() => {
    animate("button", { opacity: [0, 1], translateY: [-6, 0], duration: 500, delay: stagger(40, { start: 150 }), ease: "outQuart" });
  }, [ids.length > 0]);

  const chip = "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium backdrop-blur-md transition-colors";

  return (
    <div ref={root} role="toolbar" aria-label="Highlight people by why they listen" className={cn("no-scrollbar flex gap-1.5 overflow-x-auto px-4", className)}>
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={cn(chip, value === null ? "border-white/25 bg-white/10 text-foreground" : "border-white/10 bg-background/60 text-muted-foreground hover:text-foreground")}
      >
        Everyone
      </button>
      {ids.map((id) => {
        const c = getCluster(id);
        const on = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : id)}
            style={{ "--tone": c.color } as CSSProperties}
            className={cn(
              chip,
              on
                ? "border-[color-mix(in_oklch,var(--tone)_55%,transparent)] bg-[color-mix(in_oklch,var(--tone)_18%,var(--background))] text-[var(--tone)]"
                : "border-white/10 bg-background/60 text-foreground/80 hover:border-white/20",
            )}
          >
            <span className="size-2 rounded-full bg-[var(--tone)] shadow-[0_0_6px_var(--tone)]" aria-hidden />
            {c.short}
            <span className="tabular-nums text-muted-foreground">{counts.get(id)}</span>
          </button>
        );
      })}
    </div>
  );
}
