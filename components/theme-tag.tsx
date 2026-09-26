import type { CSSProperties } from "react";
import { clusterForLabel, getCluster } from "@/lib/clusters";
import { cn } from "@/lib/utils";

/** A motivation label in its cluster color. Pass either a cluster id or a motivation label. */
export function ThemeTag({
  cluster,
  label,
  size = "md",
  short = false,
  className,
}: {
  cluster?: string;
  label?: string;
  size?: "sm" | "md";
  short?: boolean;
  className?: string;
}) {
  const c = cluster ? getCluster(cluster) : clusterForLabel(label ?? "");
  return (
    <span
      style={{ "--tone": c.color } as CSSProperties}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-[color-mix(in_oklch,var(--tone)_35%,transparent)] bg-[color-mix(in_oklch,var(--tone)_12%,transparent)] font-medium text-[var(--tone)]",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-[var(--tone)]" aria-hidden />
      <span className="truncate">{short ? c.short : (label ?? c.label)}</span>
    </span>
  );
}
