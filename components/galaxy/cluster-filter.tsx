"use client";

import type { CSSProperties } from "react";
import { CLUSTER_IDS, getCluster } from "@/lib/clusters";
import type { GalaxyNode } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The legend, made useful: each "why" is a chip that spotlights its part of the galaxy. */
/** "4,210", or "12k" once it stops being useful to see every digit. */
const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString());

export function ClusterFilter({
  nodes,
  hidden,
  value,
  onChange,
  className,
}: {
  nodes: GalaxyNode[];
  /** People not drawn, per cluster. Chips count everyone, not just who is on screen. */
  hidden?: Record<string, number>;
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
}) {
  const counts = new Map<string, number>();
  for (const n of nodes) if (!n.isMe) counts.set(n.cluster, (counts.get(n.cluster) ?? 0) + 1);
  for (const [id, h] of Object.entries(hidden ?? {})) if (h > 0) counts.set(id, (counts.get(id) ?? 0) + h);
  const ids = CLUSTER_IDS.filter((id) => counts.has(id));

  const chip = "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors";

  return (
    <div
      role="toolbar"
      aria-label="Highlight people by why they listen"
      // One row that scrolls; the right edge fades out so the next chip reads as "more", not "cut off".
      className={cn("no-scrollbar flex gap-1.5 overflow-x-auto pl-4 pr-10 [mask-image:linear-gradient(to_right,#000_calc(100%-40px),transparent)]", className)}
    >
      <button
        type="button"
        aria-pressed={value === null}
        onClick={() => onChange(null)}
        className={cn(chip, value === null ? "border-white/30 bg-white/10 text-foreground" : "border-white/10 text-muted-foreground hover:text-foreground")}
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
                ? "border-[color-mix(in_oklch,var(--tone)_60%,transparent)] bg-[color-mix(in_oklch,var(--tone)_14%,transparent)] text-foreground"
                : "border-white/10 text-foreground/80 hover:border-white/20",
            )}
          >
            <span className="size-1.5 rounded-full bg-[var(--tone)]" aria-hidden />
            {c.short}
            <span className="tabular-nums text-muted-foreground">{compact(counts.get(id) ?? 0)}</span>
          </button>
        );
      })}
    </div>
  );
}
