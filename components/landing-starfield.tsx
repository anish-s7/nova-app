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
 * A pool of real, recognizable night-sky constellations (approximate stick-figure proportions,
 * not precise star charts). Each is authored in its own local coordinate space at its natural
 * (often very non-square) aspect ratio — a slot below fits one to its box preserving that shape
 * rather than forcing it square, so Cygnus reads as tall and the Big Dipper reads as long and low.
 * `warmIndex` picks the constellation's traditional brightest/best-known star for the gold glow.
 */
const CONSTELLATIONS: ConstellationShape[] = [
  {
    points: [[40, 40], [35, 95], [100, 105], [105, 55], [160, 60], [205, 48], [250, 25]],
    path: "M40 40 L35 95 L100 105 L105 55 L40 40 M105 55 L160 60 L205 48 L250 25",
    r: [2.8, 2.2, 2.2, 2.0, 2.4, 2.2, 2.2],
    warmIndex: 0,
  },
  {
    points: [[0, 85], [58, 25], [115, 75], [170, 15], [225, 60]],
    path: "M0 85 L58 25 L115 75 L170 15 L225 60",
    r: [2.0, 2.0, 2.0, 2.8, 2.2],
    warmIndex: 3,
  },
  {
    points: [[115, 0], [115, 95], [115, 230], [30, 115], [205, 80]],
    path: "M115 0 L115 95 L115 230 M115 95 L30 115 M115 95 L205 80",
    r: [2.8, 2.2, 2.0, 2.0, 2.0],
    warmIndex: 0,
  },
  {
    points: [[0, 160], [45, 130], [75, 165], [110, 120], [150, 140], [185, 95], [165, 55], [205, 35], [245, 15]],
    path: "M0 160 L45 130 L75 165 L110 120 L150 140 L185 95 L165 55 L205 35 L245 15",
    r: [1.9, 1.9, 1.9, 1.9, 1.9, 2.0, 2.0, 2.0, 2.6],
    warmIndex: 8,
  },
  {
    points: [[30, 20], [160, 15], [75, 100], [100, 110], [125, 120], [40, 210], [155, 200]],
    path: "M30 20 L125 120 M160 15 L75 100 M75 100 L100 110 L125 120 M75 100 L40 210 M125 120 L155 200",
    r: [2.8, 2.2, 2.0, 2.0, 2.0, 2.6, 2.2],
    warmIndex: 0,
  },
  {
    points: [[35, 0], [0, 65], [70, 75], [85, 140], [15, 130]],
    path: "M35 0 L0 65 M0 65 L70 75 L85 140 L15 130 L0 65",
    r: [2.8, 2.0, 2.0, 2.0, 2.0],
    warmIndex: 0,
  },
  {
    points: [[30, 180], [15, 140], [30, 95], [60, 70], [95, 78], [150, 100], [230, 150]],
    path: "M30 180 L15 140 L30 95 L60 70 L95 78 M95 78 L150 100 L230 150 M30 180 L150 100",
    r: [2.8, 1.9, 1.9, 2.0, 2.0, 2.2, 2.2],
    warmIndex: 0,
  },
  {
    points: [[40, 10], [65, 45], [100, 75], [130, 110], [150, 150], [140, 195], [105, 215]],
    path: "M40 10 L65 45 L100 75 L130 110 L150 150 L140 195 L105 215",
    r: [2.0, 2.8, 2.0, 2.0, 2.0, 2.0, 2.2],
    warmIndex: 1,
  },
];

/** A shape's own bounding box, in its local coordinate space — used to fit it into a slot below. */
function shapeBounds(shape: ConstellationShape) {
  const xs = shape.points.map(([x]) => x);
  const ys = shape.points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { minX, minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

/** A screen-space region a constellation is allowed to occupy; independent slots never overlap. */
interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Two slots on phones/narrow windows: one in the strip left of the original constellation
 * (which occupies roughly x 96–350), one in the strip below it (below y 296), both still clear
 * of AVOID (the headline zone starts at y 410).
 */
const TALL_SLOTS: Slot[] = [
  { x: 5, y: 20, w: 85, h: 260 },
  { x: 10, y: 300, w: 370, h: 100 },
];

/**
 * Two slots on laptops: one filling the left two-thirds of the canvas (clear of the original,
 * which lands around x 1062–1545 via WIDE_ORIGINAL_TRANSFORM), one below-right of it — both also
 * clear of WIDE_AVOID (bottom-left quadrant).
 */
const WIDE_SLOTS: Slot[] = [
  { x: 60, y: 40, w: 650, h: 470 },
  { x: 1080, y: 660, w: 460, h: 300 },
];

const MINOR: { path: string; points: Pt[] }[] = [
  { path: "M60 238 L98 298", points: [[60, 238], [98, 298]] },
  { path: "M304 330 L338 376", points: [[304, 330], [338, 376]] },
];

/**
 * The site's original, permanent constellation — the very first shape this page ever shipped
 * with. Unlike the cycling pool above, this one never fades out: it draws in once on load and
 * stays, in its original fixed spot (native tall-canvas coordinates; WIDE_ORIGINAL_TRANSFORM
 * places it on the laptop canvas). TALL_SLOTS/WIDE_SLOTS below are laid out to leave its
 * footprint (roughly x 60–350, y 56–376 on the tall canvas) clear.
 */
const ORIGINAL_FOCAL: Pt[] = [
  [96, 150],
  [168, 104],
  [244, 150],
  [300, 238],
  [212, 296],
];
const ORIGINAL_FOCAL_PATH = "M96 150 L168 104 L244 150 L300 238 L212 296";
const ORIGINAL_FOCAL_R = [2.4, 2, 2.7, 2.2, 1.8];
const ORIGINAL_WARM_INDEX = 2;
const ORIGINAL_DISTANT: Pt[] = [
  [318, 56],
  [350, 104],
];
const ORIGINAL_DISTANT_PATH = "M318 56 L350 104";
const ORIGINAL_CHAMPAGNE_PATH = "M244 150 L318 56";
/** Where the original constellation (native x 60–350, y 56–376) lands on the wide canvas. */
const WIDE_ORIGINAL_TRANSFORM = "translate(880 70) scale(1.9)";

function styleVars(vars: Record<string, string>): CSSProperties {
  return vars as CSSProperties;
}

/** One constellation's stars + connecting lines, in its own local coordinate space. */
function Constellation({ halo, shape, exiting }: { halo: string; shape: ConstellationShape; exiting: boolean }) {
  const { points, path, r, warmIndex } = shape;
  return (
    <g className={exiting ? "constellation-exit" : "constellation-enter"}>
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
/** Must cover the line's own delay + draw duration (see globals.css's sky-draw) so hold never cuts a draw-in short. */
const DRAW_MS = 4750;
const EXIT_MS = 1800;

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
  const { minX, minY, width, height } = shapeBounds(shape);
  // Fit-to-box, preserving the shape's own aspect ratio — a tall shape like Cygnus should stay
  // tall, not get squashed to fill a square slot the way a fixed reference size would force it to.
  // Centered in the slot rather than corner-anchored, since a shape's aspect ratio rarely matches
  // its slot's exactly (e.g. Lyra, portrait, dropped into the wide low strip under the original).
  const scale = Math.min(slot.w / (width || 1), slot.h / (height || 1)) * 0.88;
  const tx = slot.x + (slot.w - width * scale) / 2 - minX * scale;
  const ty = slot.y + (slot.h - height * scale) / 2 - minY * scale;

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

/** The original constellation: draws in once (same timing it always used) and then just stays. */
function OriginalConstellation({ halo }: { halo: string }) {
  return (
    <>
      <path
        d={ORIGINAL_DISTANT_PATH}
        fill="none"
        stroke="var(--color-foreground)"
        strokeOpacity={0.4}
        strokeWidth={0.7}
        pathLength={1}
        className="draw-line"
        style={styleVars({ "--draw-delay": "1.1s" })}
      />
      {ORIGINAL_DISTANT.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.1" fill="var(--color-foreground)" fillOpacity={0.65} />
      ))}

      <path
        d={ORIGINAL_CHAMPAGNE_PATH}
        fill="none"
        stroke="var(--color-primary)"
        strokeOpacity={0.55}
        strokeWidth={0.8}
        strokeLinecap="round"
        pathLength={1}
        className="draw-line"
        style={styleVars({ "--draw-delay": "2.4s" })}
      />

      <path
        d={ORIGINAL_FOCAL_PATH}
        fill="none"
        stroke="var(--color-foreground)"
        strokeOpacity={0.75}
        strokeWidth={0.9}
        strokeLinecap="round"
        pathLength={1}
        className="draw-line"
        style={styleVars({ "--draw-delay": "0.6s" })}
      />
      {ORIGINAL_FOCAL.map(([x, y], i) => {
        const radius = ORIGINAL_FOCAL_R[i] ?? 2;
        const warm = i === ORIGINAL_WARM_INDEX;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={radius * 4.6} fill={`url(#${halo}${warm ? "-gold" : ""})`} />
            <circle cx={x} cy={y} r={radius} fill={warm ? "var(--color-primary)" : "var(--color-foreground)"} fillOpacity={0.95} />
            <circle cx={x} cy={y} r={radius * 0.45} fill="var(--color-foreground)" fillOpacity={0.9} />
          </g>
        );
      })}
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
 * The welcome page's night sky: the original constellation, permanent in its original spot, plus
 * a couple of other constellations that each independently draw in, hold, fade out, and re-form
 * as a different shape elsewhere in their own slot around it. Phones and narrow windows get two
 * cycling slots (TALL_SLOTS); laptops (lg) get two bigger ones (WIDE_SLOTS) — both laid out to
 * leave the original's footprint and AVOID/WIDE_AVOID (the headline zones) clear.
 */
export function LandingStarfield() {
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <svg className="h-full w-full lg:hidden" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <Halos id="landing-halo-tall" />
        <Stars stars={bgStars} />
        <MinorTicks />
        <OriginalConstellation halo="landing-halo-tall" />
        {TALL_SLOTS.map((slot, i) => (
          <ConstellationSlot key={i} halo="landing-halo-tall" slot={slot} startDelayMs={i * 3500} />
        ))}
      </svg>
      <svg className="hidden h-full w-full lg:block" viewBox={`0 0 ${WIDE.W} ${WIDE.H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <Halos id="landing-halo-wide" />
        <Stars stars={wideStars} />
        <g transform={WIDE_ORIGINAL_TRANSFORM}>
          <OriginalConstellation halo="landing-halo-wide" />
        </g>
        {WIDE_SLOTS.map((slot, i) => (
          <ConstellationSlot key={i} halo="landing-halo-wide" slot={slot} startDelayMs={i * 3200} />
        ))}
      </svg>
    </div>
  );
}
