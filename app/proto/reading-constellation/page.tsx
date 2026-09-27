"use client";

/**
 * PROTOTYPE — not shipped. Loading-screen concept "Constellation": songs are stars, and a comet
 * reads through them, drawing a glowing line to each as a theme is found. Built only on anime.js
 * (already a dependency): createTimeline, createDrawable, createMotionPath, stagger, splitText, utils.
 *
 * Delete app/proto once approved and lifted into components/reading-sequence.tsx.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { animate, createDrawable, createMotionPath, createTimeline, splitText, stagger, utils } from "animejs";
import { RotateCcw } from "lucide-react";
import { getCluster } from "@/lib/clusters";
import { contextFor, SONG_CATALOG } from "@/lib/music-context";

const W = 360;
const H = 520;
const N = 7;

const CAPTIONS = [
  "Three of these feel like driving home at night.",
  "You reach for quiet songs when things get loud.",
  "Two of your songs carry the same loss.",
];
/** Reading order: which pair of stars each insight links (indexes into the star list). */
const LINKS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
];

function starColor(songId: string): string {
  let best = "";
  let bestW = -1;
  for (const [id, w] of Object.entries(contextFor(songId).clusters)) {
    if ((w ?? 0) > bestW) {
      bestW = w ?? 0;
      best = id;
    }
  }
  return getCluster(best).color;
}

/** Hand-placed so the shape reads as a constellation, not a scatter. */
const POS: [number, number][] = [
  [64, 120],
  [152, 78],
  [246, 128],
  [296, 232],
  [214, 290],
  [116, 268],
  [150, 384],
];

export default function ReadingConstellationProto() {
  const songs = useMemo(() => SONG_CATALOG.slice(0, N), []);
  const colors = useMemo(() => songs.map((s) => starColor(s.id)), [songs]);
  const root = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);
  const [caption, setCaption] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [label, setLabel] = useState("Going through your songs…");

  const dust = useMemo(
    () => Array.from({ length: 46 }, (_, i) => ({ x: (i * 97.3) % W, y: (i * 53.7 + (i % 5) * 31) % H, r: 0.5 + ((i * 7) % 10) / 10 })),
    [],
  );

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    setCaption(null);
    setDone(false);
    setLabel("Going through your songs…");
    const q = <T extends Element>(s: string) => Array.from(el.querySelectorAll<T>(s));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setLabel("Here's a first pass.");
      return;
    }

    const anims: { revert: () => unknown }[] = [];
    const keep = <T extends { revert: () => unknown }>(a: T) => (anims.push(a), a);

    // Ambient: dust twinkles, nebula drifts, whole field breathes. Never stops until unmount.
    keep(animate(q("[data-dust]"), { opacity: [() => utils.random(0.1, 0.35), () => utils.random(0.5, 1)], scale: [0.7, 1.4], duration: () => utils.random(1400, 3200), delay: () => utils.random(0, 2000), loop: true, alternate: true, ease: "inOutSine" }));
    keep(animate(q("[data-nebula]"), { translateX: () => utils.random(-24, 24), translateY: () => utils.random(-18, 18), scale: [1, 1.18], duration: 9000, loop: true, alternate: true, ease: "inOutSine" }));

    // Initial state.
    const lines = q<SVGPathElement>("[data-link]");
    const drawables = lines.map((l) => createDrawable(l));
    utils.set(drawables, { draw: "0 0" });
    utils.set(q("[data-star]"), { scale: 0, opacity: 0 });
    utils.set(q("[data-halo]"), { scale: 0.4, opacity: 0 });
    utils.set(q("[data-name]"), { opacity: 0, translateY: 4 });
    utils.set(q("[data-comet]"), { opacity: 0 });
    utils.set(q("[data-burst]"), { opacity: 0, scale: 0.2 });

    const starPos = POS.map(([x, y]) => ({ x, y }));
    const stars = q<SVGGElement>("[data-star]");
    const halos = q<SVGCircleElement>("[data-halo]");
    const names = q<SVGTextElement>("[data-name]");
    const bursts = q<SVGCircleElement>("[data-burst]");
    const comet = q<SVGGElement>("[data-comet]")[0];
    const trail = q<SVGPathElement>("[data-trail]")[0];

    // Comet travels through every star in reading order along one smooth path.
    const { translateX, translateY } = createMotionPath(trail);
    const tl = createTimeline({ defaults: { ease: "outExpo" }, onComplete: () => setDone(true) });

    // 1. Stars kindle in one by one, with a spring-y overshoot.
    tl.add(stars, { scale: [0, 1], opacity: [0, 1], duration: 900, ease: "outElastic(1, .6)", delay: stagger(140, { from: "first" }) }, 200)
      .add(halos, { scale: [0.4, 1], opacity: [0, 0.55], duration: 1200, delay: stagger(140) }, 200)
      .call(() => setLabel("Reading song 1 of 7…"), 1200);

    // 2. Comet reads through the stars; at each stop: burst ring, name fades in, line draws in behind it.
    const stopMs = 1250;
    const t0 = 1600;
    tl.add(comet, { opacity: [0, 1], duration: 400 }, t0 - 100);
    tl.add(comet, { translateX, translateY, duration: stopMs * (N - 1), ease: "inOutSine" }, t0);

    LINKS.forEach(([a, b], i) => {
      const at = t0 + stopMs * (i + 1) * 0.92;
      tl.add(drawables[i], { draw: ["0 0", "0 1"], duration: 900, ease: "inOutQuad" }, at - 700)
        .add(bursts[b], { scale: [0.2, 3], opacity: [0.9, 0], duration: 1100, ease: "outQuart" }, at)
        .add(stars[b], { scale: [1, 1.5, 1], duration: 700, ease: "outBack" }, at)
        .add(names[b], { opacity: [0, 1], translateY: [4, 0], duration: 700 }, at + 100)
        .call(() => setLabel(`Reading song ${Math.min(b + 1, N)} of ${N}…`), at);
    });
    tl.add(names[0], { opacity: [0, 1], translateY: [4, 0], duration: 700 }, t0 + 100)
      .add(bursts[0], { scale: [0.2, 3], opacity: [0.9, 0], duration: 1100, ease: "outQuart" }, t0);

    // 3. Insights: a themed subset of lines flare gold while the caption arrives.
    const insightAt = t0 + stopMs * (N - 1) + 700;
    CAPTIONS.forEach((c, i) => {
      const at = insightAt + i * 2600;
      tl.call(() => setCaption(c), at);
      const pair = [i * 2, i * 2 + 1];
      tl.add(lines[pair[0]], { stroke: ["#8f8ad8", "#f3c98b"], strokeWidth: [1.2, 2.6], duration: 700, alternate: true, loop: 2 }, at + 200);
      tl.add(pair.map((p) => halos[p]), { scale: [1, 1.7, 1], opacity: [0.55, 1, 0.55], duration: 1400 }, at + 200);
    });

    // 4. Converge into a single point of light and hand off.
    const endAt = insightAt + CAPTIONS.length * 2600 + 300;
    tl.add(comet, { opacity: 0, duration: 400 }, endAt - 200)
      .call(() => {}, endAt)
      .add(names, { opacity: 0, duration: 500 }, endAt)
      .add(lines, { opacity: 0, duration: 900 }, endAt)
      .call(() => setCaption(null), endAt)
      .add(q("[data-core]"), { scale: [0, 1], opacity: [0, 1], duration: 1400, ease: "outExpo" }, endAt + 1000)
      .add(q("[data-core-ring]"), { scale: [0.4, 5], opacity: [0.7, 0], duration: 1600, ease: "outQuart", delay: stagger(220) }, endAt + 1200)
      .call(() => setLabel("Here's a first pass."), endAt + 1200);
    [...stars, ...halos].forEach((t, i) => {
      const k = i % N;
      tl.add(t, { translateX: 180 - starPos[k].x, translateY: 230 - starPos[k].y, ...(i < N ? { scale: 0.2 } : {}), opacity: 0, duration: 1500, ease: "inOutCubic" }, endAt + k * 40);
    });
    keep(tl);

    return () => anims.forEach((a) => a.revert());
  }, [run, colors]);

  // Caption words arrive one by one (same treatment as the shipped screen).
  useEffect(() => {
    const p = root.current?.querySelector("[data-caption]");
    if (!p || !caption) return;
    const { words } = splitText(p, { words: { wrap: "clip" } });
    const a = animate(words, { translateY: ["105%", "0%"], opacity: [0, 1], duration: 900, delay: stagger(55), ease: "outExpo" });
    return () => void a.revert();
  }, [caption]);

  const replay = useCallback(() => setRun((r) => r + 1), []);
  const trailD = useMemo(() => {
    // Catmull-Rom → cubic bezier through every star, so the comet glides instead of zigzagging.
    const p = POS;
    let d = `M ${p[0][0]} ${p[0][1]}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] ?? p[i];
      const p1 = p[i];
      const p2 = p[i + 1];
      const p3 = p[i + 2] ?? p2;
      d += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6}, ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-black/60 p-6">
      <div ref={root} className="starfield relative flex h-[844px] max-h-[calc(100dvh-3rem)] w-[390px] flex-col overflow-hidden rounded-[2.75rem] border border-white/10">
        <div className="flex items-center justify-between px-6 pt-5">
          <span className="text-sm font-medium tracking-wide text-foreground/90">Resonyx</span>
          <button type="button" onClick={replay} aria-label="Replay" className="rounded-full p-2 text-muted-foreground hover:text-foreground">
            <RotateCcw className="size-4" />
          </button>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="relative flex-1" role="img" aria-label="Your songs forming a constellation">
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="28" />
            </filter>
            <radialGradient id="halo">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* nebula clouds tinted by the cluster colors */}
          <g filter="url(#soft)" opacity="0.5">
            <circle data-nebula cx="90" cy="150" r="70" fill={colors[0]} opacity="0.35" />
            <circle data-nebula cx="270" cy="250" r="80" fill={colors[3]} opacity="0.3" />
            <circle data-nebula cx="160" cy="390" r="70" fill={colors[6]} opacity="0.3" />
          </g>

          {dust.map((d, i) => (
            <circle key={i} data-dust cx={d.x} cy={d.y} r={d.r} fill="#fff" opacity="0.3" />
          ))}

          <path data-trail d={trailD} fill="none" stroke="none" />

          <g filter="url(#glow)">
            {LINKS.map(([a, b], i) => (
              <path key={i} data-link d={`M ${POS[a][0]} ${POS[a][1]} L ${POS[b][0]} ${POS[b][1]}`} stroke="#8f8ad8" strokeWidth="1.2" strokeLinecap="round" fill="none" />
            ))}
          </g>

          {POS.map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <circle data-halo r="26" fill="url(#halo)" style={{ color: colors[i] }} opacity="0" />
              <circle data-burst r="10" fill="none" stroke={colors[i]} strokeWidth="1.2" opacity="0" />
              <g data-star filter="url(#glow)" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
                <circle r="9" fill={colors[i]} />
                <circle r="9" fill="none" stroke="#f3c98b" strokeOpacity="0.8" strokeWidth="1" />
                <circle r="3" fill="#fff" opacity="0.9" />
              </g>
              <text data-name x="0" y="26" textAnchor="middle" className="fill-foreground/70" style={{ fontSize: 9.5 }} opacity="0">
                {songs[i].title.length > 20 ? songs[i].title.slice(0, 19) + "…" : songs[i].title}
              </text>
            </g>
          ))}

          <g data-comet filter="url(#glow)" opacity="0" style={{ transformBox: "fill-box" }}>
            <circle r="14" fill="#f3c98b" opacity="0.25" />
            <circle r="4" fill="#fff6dc" />
          </g>

          <g transform="translate(180 230)">
            <circle data-core-ring r="10" fill="none" stroke="#f3c98b" strokeWidth="1" opacity="0" />
            <circle data-core-ring r="10" fill="none" stroke="#f3c98b" strokeWidth="1" opacity="0" />
            <circle data-core r="6" fill="#f3c98b" filter="url(#glow)" opacity="0" />
          </g>
        </svg>

        <div className="relative min-h-40 px-8 pb-14 text-center" aria-live="polite">
          {caption ? (
            <p key={caption} data-caption className="text-balance font-serif text-[26px] italic leading-snug">
              {caption}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{label}</p>
          )}
        </div>
        {done ? <span className="sr-only">Done</span> : null}
      </div>
    </div>
  );
}
