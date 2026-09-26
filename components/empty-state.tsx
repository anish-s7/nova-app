import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** A small constellation with one lit star, so an empty screen still feels like part of the sky. */
function Constellation() {
  const stars: [number, number, number][] = [
    [8, 40, 1.4],
    [24, 24, 1.8],
    [44, 34, 1.3],
    [62, 14, 2.6],
    [80, 30, 1.5],
    [70, 48, 1.2],
  ];
  const links = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [2, 5],
  ];
  return (
    <svg viewBox="0 0 88 60" className="mb-5 h-14 w-[5.5rem] overflow-visible" aria-hidden>
      {links.map(([a, b]) => (
        <line key={`${a}-${b}`} x1={stars[a][0]} y1={stars[a][1]} x2={stars[b][0]} y2={stars[b][1]} stroke="currentColor" strokeOpacity="0.22" strokeWidth="0.7" className="text-foreground" />
      ))}
      <circle cx="62" cy="14" r="9" className="fill-primary/20 motion-safe:animate-orbit-pulse" />
      {stars.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} className={i === 3 ? "fill-primary" : "fill-foreground/60"} />
      ))}
    </svg>
  );
}

export function EmptyState({ title, body, action }: { icon?: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center motion-safe:animate-in motion-safe:fade-in">
      <Constellation />
      <h2 className="font-serif text-2xl italic leading-snug">{title}</h2>
      <p className="mt-1.5 max-w-64 text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
