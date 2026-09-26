"use client";

import { animate, createDrawable, createMotionPath, createTimeline, spring, stagger, utils } from "animejs";
import { useAnime } from "@/hooks/use-anime";
import { CLUSTERS } from "@/lib/clusters";

const W = 320;
const H = 200;
const A = { x: 88, y: 118 };
const B = { x: 232, y: 110 };
const ARC = `M ${A.x} ${A.y} Q ${(A.x + B.x) / 2} ${A.y - 92} ${B.x} ${B.y}`;
const TONE = CLUSTERS.quiet_company.color;

/** Deterministic so server and client render the same field. */
const FIELD = (() => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: 34 }, () => ({ x: rand() * W, y: rand() * H, r: 0.4 + rand() * 0.9 }));
})();

// Each listener's songs: different records, different colors, no overlap.
const SONGS_A = [CLUSTERS.carrying_loss.color, CLUSTERS.somewhere_else.color, CLUSTERS.old_selves.color];
const SONGS_B = [CLUSTERS.armor_up.color, CLUSTERS.somewhere_else.color, CLUSTERS.carrying_loss.color, CLUSTERS.old_selves.color];

function Orbit({ at, radius, colors, className }: { at: { x: number; y: number }; radius: number; colors: string[]; className: string }) {
  return (
    <g className={className} style={{ transformOrigin: `${at.x}px ${at.y}px`, transformBox: "view-box" }}>
      <ellipse cx={at.x} cy={at.y} rx={radius} ry={radius} fill="none" stroke="white" strokeOpacity="0.07" strokeWidth="0.6" />
      {colors.map((c, i) => {
        const t = (i / colors.length) * Math.PI * 2;
        return <circle key={i} data-song cx={at.x + Math.cos(t) * radius} cy={at.y + Math.sin(t) * radius} r="2.4" fill={c} opacity="0.85" />;
      })}
    </g>
  );
}

function Listener({ at, label, className }: { at: { x: number; y: number }; label: string; className: string }) {
  return (
    <g className={className} style={{ transformOrigin: `${at.x}px ${at.y}px`, transformBox: "view-box" }}>
      <circle cx={at.x} cy={at.y} r="14" fill={TONE} opacity="0.12" />
      <circle cx={at.x} cy={at.y} r="4.5" fill={TONE} />
      <circle cx={at.x} cy={at.y} r="2" fill="white" opacity="0.9" />
      <text x={at.x} y={at.y + 38} textAnchor="middle" className="fill-muted-foreground text-[9px]">
        {label}
      </text>
    </g>
  );
}

/** Welcome hero: two listeners, no songs in common, joined by the same reason. */
export function HeroConstellation() {
  const root = useAnime<HTMLDivElement>(() => {
    const [line] = createDrawable(".hero-arc");
    utils.set([".hero-listener", ".hero-reason", "[data-song]"], { opacity: 0 });
    utils.set(line, { draw: "0 0" });
    animate("[data-hero]", { opacity: [0, 1], duration: 500 });

    const tl = createTimeline({ defaults: { ease: "outQuart" } })
      .add(".hero-field circle", { opacity: { from: 0 }, duration: 900, delay: stagger(18, { from: "random" }) })
      .add(".hero-listener", { scale: [0, 1], opacity: [0, 1], ease: spring({ bounce: 0.45, duration: 700 }), delay: stagger(160) }, "-=600")
      .add("[data-song]", { opacity: [0, 0.85], r: [0, 2.4], duration: 500, delay: stagger(60) }, "-=300")
      .add(line, { draw: ["0 0", "0 1"], duration: 1300, ease: "inOutQuad" }, "+=150")
      .add(".hero-reason", { opacity: [0, 1], translateY: [6, 0], duration: 600 }, "-=250");

    // Ambient motion that keeps the scene alive without pulling focus.
    animate(".hero-orbit-a", { rotate: 360, duration: 38000, loop: true, ease: "linear" });
    animate(".hero-orbit-b", { rotate: -360, duration: 46000, loop: true, ease: "linear" });
    animate(".hero-twinkle", { opacity: [0.9, 0.2], duration: 1800, loop: true, alternate: true, delay: stagger(500), ease: "inOutSine" });
    // A spark travels the shared reason, fading at each end so the loop restart is invisible.
    animate(".hero-pulse", {
      ...createMotionPath(".hero-arc"),
      opacity: [
        { to: 1, duration: 300 },
        { to: 1, duration: 1900 },
        { to: 0, duration: 400 },
      ],
      duration: 2600,
      delay: 3600,
      loop: true,
      loopDelay: 1400,
      ease: "inOutSine",
    });

    return () => tl.revert();
  });

  return (
    <div ref={root} className="starfield relative mx-6 mt-6 h-52 shrink-0 overflow-hidden rounded-3xl ring-1 ring-white/[0.06]" aria-hidden>
      <svg data-hero viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full motion-safe:opacity-0">
        <defs>
          <linearGradient id="hero-arc-stroke" x1="0" x2="1">
            <stop offset="0%" stopColor={TONE} stopOpacity="0.2" />
            <stop offset="50%" stopColor={TONE} stopOpacity="0.95" />
            <stop offset="100%" stopColor={TONE} stopOpacity="0.2" />
          </linearGradient>
          <radialGradient id="hero-pulse-glow">
            <stop offset="0%" stopColor="white" />
            <stop offset="40%" stopColor={TONE} stopOpacity="0.9" />
            <stop offset="100%" stopColor={TONE} stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="hero-field">
          {FIELD.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={0.15 + s.r * 0.25} className={i % 6 === 0 ? "hero-twinkle" : undefined} />
          ))}
        </g>

        <Orbit at={A} radius={26} colors={SONGS_A} className="hero-orbit-a" />
        <Orbit at={B} radius={30} colors={SONGS_B} className="hero-orbit-b" />

        <path className="hero-arc" d={ARC} fill="none" stroke="url(#hero-arc-stroke)" strokeWidth="1.2" strokeLinecap="round" />
        <circle className="hero-pulse" r="5" fill="url(#hero-pulse-glow)" opacity="0" />

        <Listener at={A} label="Phoebe Bridgers" className="hero-listener" />
        <Listener at={B} label="Frank Ocean" className="hero-listener" />

        <g className="hero-reason">
          <rect x={W / 2 - 50} y={36} width="100" height="18" rx="9" fill={TONE} fillOpacity="0.12" stroke={TONE} strokeOpacity="0.4" strokeWidth="0.6" />
          <text x={W / 2} y={48.5} textAnchor="middle" fill={TONE} className="text-[8.5px] font-medium">
            Company in the quiet
          </text>
        </g>
      </svg>
    </div>
  );
}
