import { useMemo, type CSSProperties } from "react";

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

const FOCAL: Pt[] = [
  [96, 150],
  [168, 104],
  [244, 150],
  [300, 238],
  [212, 296],
];
const FOCAL_PATH = "M96 150 L168 104 L244 150 L300 238 L212 296";
const FOCAL_R = [2.4, 2, 2.7, 2.2, 1.8];
const WARM_INDEX = 2;

const DISTANT: Pt[] = [
  [318, 56],
  [350, 104],
];
const DISTANT_PATH = "M318 56 L350 104";
const CHAMPAGNE_PATH = "M244 150 L318 56";

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
function Constellation({ halo }: { halo: string }) {
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
        d={CHAMPAGNE_PATH}
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
        d={FOCAL_PATH}
        fill="none"
        stroke="var(--color-foreground)"
        strokeOpacity={0.75}
        strokeWidth={0.9}
        strokeLinecap="round"
        pathLength={1}
        className="draw-line"
        style={styleVars({ "--draw-delay": "0.6s" })}
      />
      {FOCAL.map(([x, y], i) => {
        const r = FOCAL_R[i] ?? 2;
        const warm = i === WARM_INDEX;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={r * 4.6} fill={`url(#${halo}${warm ? "-gold" : ""})`} />
            <circle cx={x} cy={y} r={r} fill={warm ? "var(--color-primary)" : "var(--color-foreground)"} fillOpacity={0.95} />
            <circle cx={x} cy={y} r={r * 0.45} fill="var(--color-foreground)" fillOpacity={0.9} />
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
 */
export function LandingStarfield() {
  const bgStars = useMemo(() => makeBackgroundStars(20260927, 90), []);
  const wideStars = useMemo(() => makeBackgroundStars(20260928, 300, WIDE.W, WIDE.H, WIDE_AVOID), []);

  return (
    <div className="absolute inset-0" aria-hidden="true">
      <svg className="h-full w-full lg:hidden" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <Halos id="landing-halo-tall" />
        <Stars stars={bgStars} />
        <Constellation halo="landing-halo-tall" />
      </svg>
      <svg className="hidden h-full w-full lg:block" viewBox={`0 0 ${WIDE.W} ${WIDE.H}`} preserveAspectRatio="xMidYMid slice" focusable="false">
        <Halos id="landing-halo-wide" />
        <Stars stars={wideStars} />
        <g transform={WIDE_CONSTELLATION}>
          <Constellation halo="landing-halo-wide" />
        </g>
      </svg>
    </div>
  );
}
