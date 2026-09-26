import type { CSSProperties } from "react";
import { getCluster } from "@/lib/clusters";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  cluster,
  isMe = false,
  size = 44,
  ring = false,
  className,
}: {
  name: string;
  cluster: string;
  isMe?: boolean;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ "--tone": getCluster(cluster).color, width: size, height: size, fontSize: isMe ? size * 0.3 : size * 0.42 } as CSSProperties}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--tone)_22%,var(--card))] font-semibold text-[var(--tone)]",
        ring && "ring-2 ring-[color-mix(in_oklch,var(--tone)_60%,transparent)] ring-offset-2 ring-offset-background",
        className,
      )}
    >
      {isMe ? "You" : name.slice(0, 1)}
    </span>
  );
}
