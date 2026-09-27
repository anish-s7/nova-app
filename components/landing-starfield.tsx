import { useEffect, useMemo, useState, type CSSProperties } from "react";

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
  /** The star points, in the portrait canvas's coordinates (same space FOCAL/DISTANT used). */
  points: Pt[];
  /** SVG path connecting them (a spanning tree — every star reachable, no crossing lines). */
  path: string;
  /** Per-point radius: branch stars (2–3 lines meeting) render a touch bigger than chain ends. */
  r: number[];
  /** Index of the point nearest DISTANT[0] — it gets the warm/gold star and the champagne bridge line. */
  warmIndex: number;
  /** Bridge line from points[warmIndex] to DISTANT[0], precomputed so it never crosses the shape. */
  champagnePath: string;
}

/**
 * A curated pool of 5-star constellations, one picked at random per page load (see LandingStarfield).
 * Each was generated as a minimum-spanning-tree over randomly placed points, then filtered for edges
 * that don't cross, aren't too sharp an angle, and aren't wildly mismatched in length, so every member
 * of this pool reads as a clean constellation rather than a random scribble. All fit the same safe
 * zone the original hand-drawn shape used (roughly x 55–355, y 40–320), so any of them compose cleanly
 * with DISTANT/MINOR below and with the lg: wide-canvas transform.
 */
const CONSTELLATIONS: ConstellationShape[] = [
  {
    points: [[206, 177], [142, 292], [197, 248], [134, 214], [82, 251]],
    path: "M206 177 L197 248 M197 248 L142 292 M197 248 L134 214 M134 214 L82 251",
    r: [1.9, 1.9, 2.7, 2.3, 1.9],
    warmIndex: 0,
    champagnePath: "M206 177 L318 56",
  },
  {
    points: [[340, 316], [208, 182], [239, 66], [326, 188], [157, 290]],
    path: "M340 316 L326 188 M326 188 L208 182 M208 182 L157 290 M208 182 L239 66",
    r: [1.9, 2.7, 1.9, 2.3, 1.9],
    warmIndex: 2,
    champagnePath: "M239 66 L318 56",
  },
  {
    points: [[167, 195], [245, 114], [107, 144], [239, 189], [295, 179]],
    path: "M167 195 L239 189 M239 189 L295 179 M239 189 L245 114 M167 195 L107 144",
    r: [2.3, 1.9, 1.9, 2.7, 1.9],
    warmIndex: 1,
    champagnePath: "M245 114 L318 56",
  },
  {
    points: [[336, 262], [179, 245], [275, 187], [180, 120], [99, 70]],
    path: "M336 262 L275 187 M275 187 L179 245 M275 187 L180 120 M180 120 L99 70",
    r: [1.9, 1.9, 2.7, 2.3, 1.9],
    warmIndex: 2,
    champagnePath: "M275 187 L318 56",
  },
  {
    points: [[291, 93], [86, 93], [163, 43], [201, 201], [216, 103]],
    path: "M291 93 L216 103 M216 103 L163 43 M163 43 L86 93 M216 103 L201 201",
    r: [1.9, 1.9, 2.3, 1.9, 2.7],
    warmIndex: 4,
    champagnePath: "M216 103 L318 56",
  },
  {
    points: [[202, 182], [265, 267], [82, 291], [326, 307], [116, 204]],
    path: "M202 182 L116 204 M116 204 L82 291 M202 182 L265 267 M265 267 L326 307",
    r: [2.3, 2.3, 1.9, 1.9, 2.3],
    warmIndex: 0,
    champagnePath: "M202 182 L318 56",
  },
  {
    points: [[338, 301], [274, 175], [82, 287], [240, 309], [175, 241]],
    path: "M338 301 L240 309 M240 309 L175 241 M175 241 L82 287 M175 241 L274 175",
    r: [1.9, 1.9, 1.9, 2.3, 2.7],
    warmIndex: 1,
    champagnePath: "M274 175 L318 56",
  },
];

const DISTANT: Pt[] = [
  [318, 56],
  [350, 104],
];
const DISTANT_PATH = "M318 56 L350 104";

const MINOR: { path: string; points: Pt[] }[] = [
  { path: "M60 238 L98 298", points: [[60, 238], [98, 298]] },
  { path: "M304 330 L338 376", points: [[304, 330], [338, 376]] },
];

function pathDelay(index: number, base: number) {
  return `${base + index * 0.45}s`;
}

function styleVars(vars: Record<string, string>): CSSProperties {
  return vars as CSSProperties;
}

/** The focal constellation (draws in once), in the portrait canvas's coordinates. */
function Constellation({ halo, shape }: { halo: string; shape: ConstellationShape }) {
  const { points, path, r, warmIndex, champagnePath } = shape;
  return (
    <>
        {MINOR.map((m, i) => (
        <g key={`minor-${i}`}>
          <path
            d={m.path}
            fill="none"
            stroke="var(--color-foreground)"
            strokeOpacity={0.28}
            strokeWidth={0.7}
            pathLength={1}
            className="draw-line"
            style={styleVars({ "--draw-delay": pathDelay(i, 1.4) })}
          />
          {m.points.map(([x, y], j) => (
            <circle key={j} cx={x} cy={y} r="0.9" fill="var(--color-foreground)" fillOpacity={0.55} />
          ))}
        </g>
      ))}

      <path
        d={DISTANT_PATH}
        fill="none"
        stroke="var(--color-foreground)"
        strokeOpacity={0.4}
        strokeWidth={0.7}
        pathLength={1}
        className="draw-line"
        style={styleVars({ "--draw-delay": "1.1s" })}
      />
      {DISTANT.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.1" fill="var(--color-foreground)" fillOpacity={0.65} />
      ))}

      <path
        d={champagnePath}
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
        d={path}
        fill="none"
        stroke="var(--color-foreground)"
        strokeOpacity={0.75}
        strokeWidth={0.9}
        strokeLinecap="round"
        pathLength={1}
        className="draw-line"
        style={styleVars({ "--draw-delay": "0.6s" })}
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
    </>
  );
}

/** Halo gradients the constellation's stars use. */
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

/** Wide canvas for laptops: stars across the whole window, the constellation larger on the right. */
const WIDE = { W: 1600, H: 1000 };
/** Where the portrait constellation (x 60–350, y 56–376) lands on the wide canvas. */
const WIDE_CONSTELLATION = "translate(880 70) scale(1.9)";
/** Keep the wide sky quiet behind the headline, bottom-left. */
const WIDE_AVOID = { x: 40, y: 560, w: 720, h: 420, keep: 0.14 };

/**
 * The welcome page's night sky: background stars plus a focal constellation drawing in once.
 * Phones and narrow windows: the portrait composition. Laptops (lg): a landscape version so the
 * welcome screen fills the window instead of cropping the constellation away.
 *
 * The constellation shape is one of CONSTELLATIONS, chosen at random each load — but only once
 * mounted on the client (`useEffect`, not a lazy `useState` initializer): picking during render
 * would make the server's guess and the client's real pick disagree and desync the two renders
 * React reconciles during hydration. Server and first client paint both render no constellation
 * (stars only); the pick lands a tick later and both breakpoints' <svg> use the same index, so a
 * phone and a resized/laptop window during the same visit show the same shape, just laid out
 * differently by the existing wide-canvas transform below.
 */
export function LandingStarfield() {
  const bgStars = useMemo(() => makeBackgroundStars(20260927, 90), []);
  const wideStars = useMemo(() => makeBackgroundStars(20260928, 300, WIDE.W, WIDE.H, WIDE_AVOID), []);
  const [shapeIndex, setShapeIndex] = useState<number | null>(null);

  useEffect(() => {
    setShapeIndex(Math.floor(Math.random() * CONSTELLATIONS.length));
  }, []);

  const shape = shapeIndex === null ? null : CONSTELLATIONS[shapeIndex];

  return (
    <div className="absolute inset-0" aria-hidden="true">
      <svg className="h-full w-full lg:hidden" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <Halos id="landing-halo-tall" />
        <Stars stars={bgStars} />
        {shape ? <Constellation key={shapeIndex} halo="landing-halo-tall" shape={shape} /> : null}
      </svg>
      <svg className="hidden h-full w-full lg:block" viewBox={`0 0 ${WIDE.W} ${WIDE.H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <Halos id="landing-halo-wide" />
        <Stars stars={wideStars} />
        <g transform={WIDE_CONSTELLATION}>
          {shape ? <Constellation key={shapeIndex} halo="landing-halo-wide" shape={shape} /> : null}
        </g>
      </svg>
    </div>
  );
}
