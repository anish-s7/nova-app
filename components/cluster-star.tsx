import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * A cluster's (or song theme's) color as a small matte four-point star instead of a flat dot.
 * `color` can be any CSS color, including `var(--tone)`. `hollow` draws just the outline (a song
 * theme still forming).
 */
export function ClusterStar({ color, size = 11, hollow = false, className }: { color: string; size?: number; hollow?: boolean; className?: string }) {
  const style: CSSProperties = { width: size, height: size, color };
  return (
    <svg viewBox="0 0 16 16" className={cn("inline-block shrink-0 align-middle", className)} style={style} aria-hidden focusable="false">
      <path
        d="M8 0.5C8.55 5.1 10.9 7.45 15.5 8C10.9 8.55 8.55 10.9 8 15.5C7.45 10.9 5.1 8.55 0.5 8C5.1 7.45 7.45 5.1 8 0.5Z"
        fill={hollow ? "none" : "currentColor"}
        stroke={hollow ? "currentColor" : "none"}
        strokeWidth={hollow ? 1.2 : 0}
        strokeLinejoin="round"
      />
    </svg>
  );
}
