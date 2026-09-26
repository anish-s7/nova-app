import type { CSSProperties } from "react";
import { getCluster } from "@/lib/clusters";
import { cn } from "@/lib/utils";

const BACKGROUNDS = ["#3b3a52", "#4a3f45", "#33474a", "#4d4536", "#3e4a3a", "#48384f", "#3a4257", "#503f3a"];
const SKIN = ["#f1c9a5", "#e0a97f", "#c68a5e", "#a06a44", "#7a4b2e", "#5a3520"];
const HAIR = ["#1f1a17", "#3a2a1e", "#5b3a22", "#8a5a2b", "#c9a15a", "#8c8c94", "#7a2f2f", "#2e3a5c"];
const SHIRTS = ["#d8c7a3", "#c7d1cf", "#d9b8b0", "#bfc8a6", "#c4b9d6", "#e0d2b4", "#7f9bb5", "#b5787f"];

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Hair drawn behind the head (long styles) and on top of it. */
function hairBack(style: number, c: string) {
  if (style === 3) return <path d="M9 30c-2-14 3-25 11-25s13 11 11 25c0 4-3 6-4 6H13c-1 0-4-2-4-6z" fill={c} />;
  if (style === 4) return <circle cx="20" cy="4" r="4.5" fill={c} />;
  return null;
}
function hairFront(style: number, c: string) {
  switch (style) {
    case 0: // short crop
      return <path d="M12.5 15c-.5-6 3-9 7.5-9s8 3 7.5 9c-2-3-5-4-7.5-4s-5.500 1-7.500 4z" fill={c} />;
    case 1: // side part
      return <path d="M12 16c-1-7 3-10 8.500-10 5 0 8.500 3 7.500 10-1-4-4-6-7-6-3.500 0-7 1-9 6z" fill={c} />;
    case 2: // curly
      return (
        <g fill={c}>
          {[12, 15.500, 20, 24.500, 28].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 ? 9 : 10.500} r="4" />
          ))}
        </g>
      );
    case 3: // long, parted
      return <path d="M11.500 18c0-8 3-11.500 8.500-11.500S28.500 10 28.500 18c-3-2-6-5-8.500-8-1.500 3.500-4.500 6.500-8.500 8z" fill={c} />;
    case 4: // bun
      return <path d="M12 16c0-6 3-9 8-9s8 3 8 9c-2-3-5-4-8-4s-6 1-8 4z" fill={c} />;
    default: // buzzed
      return <path d="M13 14.500c0-5 3-7.500 7-7.500s7 2.500 7 7.500c-2-2.500-4.500-3.500-7-3.500s-5 1-7 3.500z" fill={c} opacity="0.75" />;
  }
}

/** A small generative portrait, stable per person and independent of their cluster color. */
function Portrait({ name }: { name: string }) {
  const h = hash(name);
  const bg = BACKGROUNDS[h % BACKGROUNDS.length];
  const skin = SKIN[(h >>> 3) % SKIN.length];
  const hair = HAIR[(h >>> 6) % HAIR.length];
  const shirt = SHIRTS[(h >>> 9) % SHIRTS.length];
  const style = (h >>> 12) % 6;
  const glasses = (h >>> 16) % 4 === 0;
  const smile = (h >>> 18) % 3;
  const shade = "#00000026";
  return (
    <svg viewBox="0 0 40 40" className="size-full">
      <rect width="40" height="40" fill={bg} />
      {hairBack(style, hair)}
      <path d="M5 40c0-8 6-11.500 15-11.500S35 32 35 40z" fill={shirt} />
      <rect x="17" y="23" width="6" height="7" rx="2" fill={skin} />
      <rect x="17" y="23" width="6" height="3" fill={shade} />
      <ellipse cx="20" cy="18" rx="7.500" ry="8.500" fill={skin} />
      <circle cx="12.600" cy="19" r="1.400" fill={skin} />
      <circle cx="27.400" cy="19" r="1.400" fill={skin} />
      {hairFront(style, hair)}
      <circle cx="17" cy="18" r="0.900" fill="#241c18" />
      <circle cx="23" cy="18" r="0.900" fill="#241c18" />
      {glasses && (
        <g fill="none" stroke="#241c18" strokeWidth="0.700">
          <circle cx="17" cy="18" r="2.400" />
          <circle cx="23" cy="18" r="2.400" />
          <path d="M19.400 18h1.200" />
        </g>
      )}
      {smile === 0 ? (
        <path d="M17.500 22.500q2.500 2 5 0" fill="none" stroke="#241c18" strokeWidth="0.800" strokeLinecap="round" />
      ) : smile === 1 ? (
        <path d="M18 22.800h4" fill="none" stroke="#241c18" strokeWidth="0.800" strokeLinecap="round" />
      ) : (
        <path d="M17.500 22.300q2.500 3 5 0z" fill="#241c18" />
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
