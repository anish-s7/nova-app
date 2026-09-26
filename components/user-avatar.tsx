import type { CSSProperties } from "react";
import { getCluster } from "@/lib/clusters";
import { cn } from "@/lib/utils";

const BACKGROUNDS = ["#3b3a52", "#4a3f45", "#33474a", "#4d4536", "#3e4a3a", "#48384f", "#3a4257", "#503f3a"];
const FOREGROUNDS = ["#d8c7a3", "#c7d1cf", "#d9b8b0", "#bfc8a6", "#c4b9d6", "#e0d2b4"];

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A small generative portrait (no photo yet), stable per person and independent of their cluster color. */
function Portrait({ name }: { name: string }) {
  const h = hash(name);
  const bg = BACKGROUNDS[h % BACKGROUNDS.length];
  const fg = FOREGROUNDS[(h >>> 4) % FOREGROUNDS.length];
  const fg2 = FOREGROUNDS[(h >>> 8) % FOREGROUNDS.length];
  const kind = (h >>> 12) % 4;
  return (
    <svg viewBox="0 0 40 40" className="size-full">
      <rect width="40" height="40" fill={bg} />
      {kind === 0 ? (
        <>
          <circle cx="20" cy="16" r="7" fill={fg} />
          <path d="M6 40c0-9 6-14 14-14s14 5 14 14z" fill={fg2} opacity="0.85" />
        </>
      ) : kind === 1 ? (
        <>
          <path d="M0 26 20 6l20 20v14H0z" fill={fg} opacity="0.9" />
          <circle cx="28" cy="12" r="5" fill={fg2} />
        </>
      ) : kind === 2 ? (
        <>
          <rect x="0" y="22" width="40" height="18" fill={fg} opacity="0.85" />
          <circle cx="14" cy="16" r="8" fill={fg2} />
        </>
      ) : (
        <>
          <path d="M0 0h20v40H0z" fill={fg} opacity="0.8" />
          <circle cx="28" cy="20" r="9" fill={fg2} />
        </>
      )}
    </svg>
  );
}

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
      style={{ "--tone": getCluster(cluster).color, width: size, height: size, fontSize: size * 0.3 } as CSSProperties}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        isMe && "bg-primary text-primary-foreground",
        ring && "ring-2 ring-[color-mix(in_oklch,var(--tone)_60%,transparent)] ring-offset-2 ring-offset-background",
        className,
      )}
    >
      {isMe ? "You" : <Portrait name={name} />}
    </span>
  );
}
