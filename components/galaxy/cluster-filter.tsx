"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { getCluster } from "@/lib/clusters";
import type { GalaxyNode } from "@/lib/types";
import { cn } from "@/lib/utils";

const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString());

export function ClusterFilter({
  nodes,
  hidden,
  value,
  onChange,
  className,
}: {
  nodes: GalaxyNode[];
  /** People not drawn, per cluster. Counts everyone, not just who is on screen. */
  hidden?: Record<string, number>;
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const counts = new Map<string, number>();
  for (const n of nodes) if (!n.isMe) counts.set(n.cluster, (counts.get(n.cluster) ?? 0) + 1);
  for (const [id, h] of Object.entries(hidden ?? {})) if (h > 0) counts.set(id, (counts.get(id) ?? 0) + h);

  const totalListeners = nodes.filter((n) => !n.isMe).length + (Object.values(hidden ?? {}).reduce((a, b) => a + b, 0));
  const ids = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));

  const activeCluster = value ? getCluster(value) : null;
  const activeCount = value ? (counts.get(value) ?? 0) : totalListeners;

  // Close popover when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative inline-block px-4", className)}>
      {/* Compact Floating Glass Capsule Trigger */}
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
        style={activeCluster ? ({ "--tone": activeCluster.color } as CSSProperties) : undefined}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all duration-200 shadow-md backdrop-blur-md",
          activeCluster
            ? "border-[color-mix(in_oklch,var(--tone)_50%,transparent)] bg-[color-mix(in_oklch,var(--tone)_12%,transparent)] text-foreground hover:bg-[color-mix(in_oklch,var(--tone)_20%,transparent)]"
            : "border-white/15 bg-background/60 text-foreground/90 hover:border-white/30 hover:bg-background/80 hover:text-foreground",
        )}
      >
        {activeCluster ? (
          <span
            className="size-2 rounded-full bg-[var(--tone)] shadow-[0_0_6px_var(--tone)] shrink-0"
            aria-hidden
          />
        ) : (
          <Sparkles className="size-3 text-primary shrink-0" aria-hidden />
        )}

        <span className="font-medium truncate max-w-[130px]">
          {activeCluster ? activeCluster.short : "Everyone"}
        </span>

        <span className="tabular-nums text-muted-foreground/80 text-[11px]">
          {compact(activeCount)}
        </span>

        <ChevronDown
          className={cn("size-3 text-muted-foreground transition-transform duration-200 shrink-0", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {/* Sleek Frosted Glass Popover Menu */}
      {open ? (
        <div
          role="dialog"
          aria-label="Filter by constellation"
          className="pointer-events-auto absolute left-4 top-full z-50 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-background/95 p-1.5 backdrop-blur-2xl shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <div className="mb-1 flex items-center justify-between px-2 pt-1 pb-1 border-b border-white/10">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Constellation
            </span>
            {value !== null ? (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Reset
              </button>
            ) : null}
          </div>

          <div className="space-y-0.5 max-h-[50vh] overflow-y-auto no-scrollbar pr-0.5">
            {/* Everyone Option */}
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={cn(
                "w-full text-left flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 transition-all duration-150",
                value === null
                  ? "bg-white/10 text-foreground font-medium"
                  : "hover:bg-white/5 text-foreground/80 hover:text-foreground",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles className="size-3 text-primary shrink-0" />
                <span className="text-xs truncate">Everyone</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="tabular-nums text-[11px] text-muted-foreground">
                  {compact(totalListeners)}
                </span>
                {value === null ? <Check className="size-3.5 text-primary" /> : null}
              </div>
            </button>

            {/* Individual Constellations */}
            {ids.map((id) => {
              const c = getCluster(id);
              const isSelected = value === id;
              const count = counts.get(id) ?? 0;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onChange(isSelected ? null : id);
                    setOpen(false);
                  }}
                  style={{ "--tone": c.color } as CSSProperties}
                  className={cn(
                    "w-full text-left flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5 transition-all duration-150 group",
                    isSelected
                      ? "border border-[color-mix(in_oklch,var(--tone)_40%,transparent)] bg-[color-mix(in_oklch,var(--tone)_12%,transparent)] text-foreground"
                      : "border border-transparent hover:bg-white/5 text-foreground/85 hover:text-foreground",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="size-2 shrink-0 rounded-full bg-[var(--tone)] shadow-[0_0_6px_var(--tone)]"
                        aria-hidden
                      />
                      <span className="text-xs font-medium truncate">{c.short}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="tabular-nums text-[11px] text-muted-foreground">
                        {compact(count)}
                      </span>
                      {isSelected ? <Check className="size-3.5 text-foreground" /> : null}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground/80 line-clamp-1 pl-4">
                    {c.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
