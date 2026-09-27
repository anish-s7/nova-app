"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useReducedMotion } from "@/hooks/use-capabilities";

/** Deterministic PRNG so server and client render the identical sky. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface BgStar {
  x: number;
  y: number;
  r: number;
  opacity: number;
  twinkle: boolean;
  delay: number;
  duration: number;
}

/** Keeps most background stars clear of the hero copy at the bottom of the frame. */
const AVOID = { x: 10, y: 410, w: 370, h: 360, keep: 0.16 };
const W = 390;
const H = 780;

function makeBackgroundStars(seed: number, count: number, width = W, height = H, avoid = AVOID): BgStar[] {
  const rand = mulberry32(seed);
  const stars: BgStar[] = [];
  let guard = 0;
  while (stars.length < count && guard < count * 40) {
    guard += 1;
    const x = rand() * width;
    const y = rand() * height;
    const inAvoid = x > avoid.x && x < avoid.x + avoid.w && y > avoid.y && y < avoid.y + avoid.h;
    if (inAvoid && rand() > avoid.keep) continue;
    const r = 0.35 + Math.pow(rand(), 2.6) * 1.6;
    const base = 0.12 + Math.pow(rand(), 1.8) * 0.78;
    // Only the brighter stars twinkle visibly — dimming a near-invisible star is wasted motion.
    const twinkle = !inAvoid && base > 0.45 && rand() < 0.55;
    stars.push({
      x,
      y,
      r,
      opacity: inAvoid ? base * 0.4 : base,
      twinkle,
      delay: rand() * 5,
      duration: 3 + rand() * 2.5,
    });
  }
  return stars;
}

type Pt = [number, number];

interface ConstellationShape {
  /** The star points, normalized to their own small bounding box (not any particular slot). */
  points: Pt[];
  /** SVG path connecting them (a spanning tree — every star reachable, no crossing lines). */
  path: string;
  /** Per-point radius: branch stars (2–3 lines meeting) render a touch bigger than chain ends. */
  r: number[];
  /** Index of the point that gets the warm/gold star instead of white. */
  warmIndex: number;
}

/**
 * A curated pool of 5-star constellations. Each was generated as a minimum-spanning-tree over
 * randomly placed points, then filtered for edges that don't cross, aren't too sharp an angle,
 * and aren't wildly mismatched in length, so every member of this pool reads as a clean
 * constellation rather than a random scribble. They're authored in their own local coordinate
 * space (up to roughly 260 units wide/tall) — SLOT below places and scales one at runtime.
 */
const CONSTELLATIONS: ConstellationShape[] = [
  {
    points: [[206, 177], [142, 292], [197, 248], [134, 214], [82, 251]],
    path: "M206 177 L197 248 M197 248 L142 292 M197 248 L134 214 M134 214 L82 251",
    r: [1.9, 1.9, 2.7, 2.3, 1.9],
    warmIndex: 0,
  },
  {
    points: [[340, 316], [208, 182], [239, 66], [326, 188], [157, 290]],
    path: "M340 316 L326 188 M326 188 L208 182 M208 182 L157 290 M208 182 L239 66",
    r: [1.9, 2.7, 1.9, 2.3, 1.9],
    warmIndex: 2,
  },
  {
    points: [[167, 195], [245, 114], [107, 144], [239, 189], [295, 179]],
    path: "M167 195 L239 189 M239 189 L295 179 M239 189 L245 114 M167 195 L107 144",
    r: [2.3, 1.9, 1.9, 2.7, 1.9],
    warmIndex: 1,
  },
  {
    points: [[336, 262], [179, 245], [275, 187], [180, 120], [99, 70]],
    path: "M336 262 L275 187 M275 187 L179 245 M275 187 L180 120 M180 120 L99 70",
    r: [1.9, 1.9, 2.7, 2.3, 1.9],
    warmIndex: 2,
  },
  {
    points: [[291, 93], [86, 93], [163, 43], [201, 201], [216, 103]],
    path: "M291 93 L216 103 M216 103 L163 43 M163 43 L86 93 M216 103 L201 201",
    r: [1.9, 1.9, 2.3, 1.9, 2.7],
    warmIndex: 4,
  },
  {
    points: [[202, 182], [265, 267], [82, 291], [326, 307], [116, 204]],
    path: "M202 182 L116 204 M116 204 L82 291 M202 182 L265 267 M265 267 L326 307",
    r: [2.3, 2.3, 1.9, 1.9, 2.3],
    warmIndex: 0,
  },
  {
    points: [[338, 301], [274, 175], [82, 287], [240, 309], [175, 241]],
    path: "M338 301 L240 309 M240 309 L175 241 M175 241 L82 287 M175 241 L274 175",
    r: [1.9, 1.9, 1.9, 2.3, 2.7],
    warmIndex: 1,
  },
];

/** The largest bounding box any pool member above actually spans, for fitting into a slot below. */
const SHAPE_REFERENCE = 260;

function shapeOrigin(shape: ConstellationShape) {
  const xs = shape.points.map(([x]) => x);
  const ys = shape.points.map(([, y]) => y);
  return { minX: Math.min(...xs), minY: Math.min(...ys) };
}

/** A screen-space region a constellation is allowed to occupy; independent slots never overlap. */
interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Two slots on phones/narrow windows, clear of AVOID (the headline zone starts at y 410). */
const TALL_SLOTS: Slot[] = [
  { x: 15, y: 20, w: 180, h: 300 },
  { x: 195, y: 40, w: 180, h: 300 },
];

/** Three slots on laptops — more room, and WIDE_AVOID only covers the bottom-left quadrant. */
const WIDE_SLOTS: Slot[] = [
  { x: 60, y: 40, w: 340, h: 340 },
  { x: 1150, y: 60, w: 380, h: 380 },
  { x: 850, y: 600, w: 380, h: 340 },
];

const MINOR: { path: string; points: Pt[] }[] = [
  { path: "M60 238 L98 298", points: [[60, 238], [98, 298]] },
  { path: "M304 330 L338 376", points: [[304, 330], [338, 376]] },
];

function styleVars(vars: Record<string, string>): CSSProperties {
  return vars as CSSProperties;
}

/** One constellation's stars + connecting lines, in its own local coordinate space. */
function Constellation({ halo, shape, exiting }: { halo: string; shape: ConstellationShape; exiting: boolean }) {
  const { points, path, r, warmIndex } = shape;
  return (
    <g className={exiting ? "constellation-exit" : undefined}>
      <path
        d={path}
        fill="none"
        stroke="var(--color-foreground)"
        strokeOpacity={0.75}
        strokeWidth={0.9}
        strokeLinecap="round"
        pathLength={1}
        className="draw-line"
        style={styleVars({ "--draw-delay": "0.15s" })}
      />
      {points.map(([x, y], i) => {
        const radius = r[i] ?? 2;
        const warm = i === warmIndex;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={radius * 4.6} fill={`url(#${halo}${warm ? "-gold" : ""})`} />
            <circle cx={x} cy={y} r={radius} fill={warm ? "var(--color-primary)" : "var(--color-foreground)"} fillOpacity={0.95} />
            <circle cx={x} cy={y} r={radius * 0.45} fill="var(--color-foreground)" fillOpacity={0.9} />
          </g>
        );
      })}
    </g>
  );
}

const HOLD_MS = 7000;
const DRAW_MS = 2800;
const EXIT_MS = 1400;

interface SlotState {
  shapeIndex: number | null;
  exiting: boolean;
}

function pickDifferent(prev: number | null) {
  if (CONSTELLATIONS.length <= 1) return 0;
  let next = prev;
  while (next === prev) next = Math.floor(Math.random() * CONSTELLATIONS.length);
  return next;
}

/**
 * Runs one slot's independent draw-in → hold → fade-out → (new shape) → ... loop forever.
 * Reduced motion: picks one shape and stops, matching this codebase's other motion-gated loops
 * (see hooks/use-capabilities.ts's useReducedMotion, used the same way in reading-sequence.tsx).
 * Starts empty on both server and the first client render (see LandingStarfield) so the random
 * pick never desyncs hydration; the loop itself only ever runs client-side inside this effect.
 */
function useCyclingSlot(startDelayMs: number): SlotState {
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState<SlotState>({ shapeIndex: null, exiting: false });

  useEffect(() => {
    if (reducedMotion) {
      setState({ shapeIndex: Math.floor(Math.random() * CONSTELLATIONS.length), exiting: false });
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let current: number | null = null;

    function enter() {
      current = pickDifferent(current);
      setState({ shapeIndex: current, exiting: false });
      timer = setTimeout(exit, DRAW_MS + HOLD_MS);
    }
    function exit() {
      if (cancelled) return;
      setState((s) => ({ ...s, exiting: true }));
      timer = setTimeout(enter, EXIT_MS);
    }

    timer = setTimeout(enter, startDelayMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reducedMotion, startDelayMs]);

  return state;
}

/** One slot: picks its own shape on a loop and places it via a computed translate+scale. */
function ConstellationSlot({ halo, slot, startDelayMs }: { halo: string; slot: Slot; startDelayMs: number }) {
  const { shapeIndex, exiting } = useCyclingSlot(startDelayMs);
  if (shapeIndex === null) return null;

  const shape = CONSTELLATIONS[shapeIndex];
  const { minX, minY } = shapeOrigin(shape);
  const scale = (Math.min(slot.w, slot.h) / SHAPE_REFERENCE) * 0.9;
  const tx = slot.x - minX * scale;
  const ty = slot.y - minY * scale;

  return (
    <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scale.toFixed(3)})`}>
      <Constellation key={shapeIndex} halo={halo} shape={shape} exiting={exiting} />
    </g>
  );
}

/** Two small fixed tick-mark stars — ambient texture, not part of the cycling constellations. */
function MinorTicks() {
  return (
    <>
      {MINOR.map((m, i) => (
        <g key={i}>
          <path
            d={m.path}
            fill="none"
            stroke="var(--color-foreground)"
            strokeOpacity={0.28}
            strokeWidth={0.7}
            pathLength={1}
            className="draw-line"
            style={styleVars({ "--draw-delay": `${1.4 + i * 0.45}s` })}
          />
          {m.points.map(([x, y], j) => (
            <circle key={j} cx={x} cy={y} r="0.9" fill="var(--color-foreground)" fillOpacity={0.55} />
          ))}
        </g>
      ))}
    </>
  );
}

/** Halo gradients the constellations' stars use. */
/** `id` must be unique per SVG: a gradient defined inside a hidden SVG doesn't paint in Chrome. */
function Halos({ id }: { id: string }) {
  return (
    <defs>
      <radialGradient id={id}>
        <stop offset="0%" stopColor="var(--color-foreground)" stopOpacity="0.28" />
        <stop offset="45%" stopColor="var(--color-foreground)" stopOpacity="0.08" />
        <stop offset="100%" stopColor="var(--color-foreground)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-gold`}>
        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.3" />
        <stop offset="50%" stopColor="var(--color-primary)" stopOpacity="0.08" />
        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

function Stars({ stars }: { stars: BgStar[] }) {
  return (
    <>
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.x.toFixed(3)}
          cy={s.y.toFixed(3)}
          r={s.r.toFixed(3)}
          fill="var(--color-foreground)"
          style={styleVars({
            opacity: s.opacity.toFixed(4),
            ...(s.twinkle
              ? { "--tw-base": s.opacity.toFixed(4), "--tw-delay": `${s.delay.toFixed(2)}s`, "--tw-dur": `${s.duration.toFixed(2)}s` }
              : {}),
          })}
          className={s.twinkle ? "twinkle" : undefined}
        />
      ))}
    </>
  );
}

/** Wide canvas for laptops: stars across the whole window, constellations spread across it. */
const WIDE = { W: 1600, H: 1000 };
/** Keep the wide sky quiet behind the headline, bottom-left. */
const WIDE_AVOID = { x: 40, y: 560, w: 720, h: 420, keep: 0.14 };

const bgStars = makeBackgroundStars(20260927, 90);
const wideStars = makeBackgroundStars(20260928, 300, WIDE.W, WIDE.H, WIDE_AVOID);

/**
 * The welcome page's night sky: background stars plus a handful of constellations that each
 * independently draw in, hold, fade out, and re-form as a different shape elsewhere in their own
 * slot — a living sky rather than one shape that redraws itself in place. Phones and narrow
 * windows get two slots (TALL_SLOTS); laptops (lg) get three, since there's more room and
 * WIDE_AVOID only guards the bottom-left quadrant.
 */
export function LandingStarfield() {
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <svg className="h-full w-full lg:hidden" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <Halos id="landing-halo-tall" />
        <Stars stars={bgStars} />
        <MinorTicks />
        {TALL_SLOTS.map((slot, i) => (
          <ConstellationSlot key={i} halo="landing-halo-tall" slot={slot} startDelayMs={i * 3500} />
        ))}
      </svg>
      <svg className="hidden h-full w-full lg:block" viewBox={`0 0 ${WIDE.W} ${WIDE.H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <Halos id="landing-halo-wide" />
        <Stars stars={wideStars} />
        {WIDE_SLOTS.map((slot, i) => (
          <ConstellationSlot key={i} halo="landing-halo-wide" slot={slot} startDelayMs={i * 3200} />
        ))}
      </svg>
    </div>
  );
}
