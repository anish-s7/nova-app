"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { animate, createDrawable, createMotionPath, createTimeline, splitText, stagger, utils } from "animejs";
import { Loader2 } from "lucide-react";
import { DemoSteps } from "@/components/onboarding/demo-steps";
import { Logo } from "@/components/common/logo";
import { Button } from "@/components/ui/button";
import { useAnime } from "@/hooks/use-anime";
import { useReducedMotion, useWebGL } from "@/hooks/use-capabilities";
import { usePacer } from "@/hooks/use-pacer";
import { analyzeMusic, saveSongs } from "@/lib/data/api";
import { CLUSTER_IDS, getCluster } from "@/lib/galaxy/clusters";
import { contextFor } from "@/lib/music/music-context";
import { effectiveSongs, setSession, useSession } from "@/lib/data/session";
import type { Song } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const MAX_COVERS = 8;
const W = 360;
const H = 520;
const CORE = { x: W / 2, y: H * 0.45 };
const LINK_STROKE = "#8f8ad8";
const GOLD = "#f3c98b";

/** Dominant cluster color for a song; songs outside the catalog get a stable color from their title. */
export function starColor(song: Song): string {
  let best = "";
  let bestW = 0;
  for (const [id, w] of Object.entries(contextFor(song.id).clusters)) {
    if ((w ?? 0) > bestW) {
      bestW = w ?? 0;
      best = id;
    }
  }
  if (best) return getCluster(best).color;
  let h = 2166136261;
  for (const c of song.title) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return getCluster(CLUSTER_IDS[(h >>> 0) % CLUSTER_IDS.length]).color;
}

/** A winding top-to-bottom path so the shape reads as a constellation, not a scatter. */
function layout(n: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    return [W / 2 + Math.sin(i * 1.9 + 0.6) * W * 0.3 + Math.cos(i * 4.3) * 12, 70 + t * (H - 190) + Math.sin(i * 3.1) * 10] as [number, number];
  });
}

/** Catmull-Rom → cubic bezier through every star, so the comet glides instead of zigzagging. */
function trailPath(p: [number, number][]): string {
  if (p.length < 2) return "";
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p3 = p[i + 2] ?? p[i + 1];
    d += ` C ${p[i][0] + (p[i + 1][0] - p0[0]) / 6} ${p[i][1] + (p[i + 1][1] - p0[1]) / 6}, ${p[i + 1][0] - (p3[0] - p[i][0]) / 6} ${p[i + 1][1] - (p3[1] - p[i][1]) / 6}, ${p[i + 1][0]} ${p[i + 1][1]}`;
  }
  return d;
}

const DUST = Array.from({ length: 46 }, (_, i) => ({ x: (i * 97.3) % W, y: (i * 53.7 + (i % 5) * 31) % H, r: 0.5 + ((i * 7) % 10) / 10 }));

const ReadingConstellationScene = dynamic(() => import("@/components/onboarding/reading-constellation-scene"), { ssr: false, loading: () => null });

/**
 * Screen 4: songs kindle as stars and a comet reads through them, drawing a line to each. Pattern
 * highlights then flare one link at a time, and everything converges into a point of light.
 */
export function ReadingSequence() {
  const router = useRouter();
  const session = useSession();
  const songs = effectiveSongs(session).slice(0, MAX_COVERS);
  const { wait, advance } = usePacer(session.demo);

  const { data, error, mutate, isValidating } = useSWR(
    ["analysis", session.version],
    () => analyzeMusic({ songs: effectiveSongs(session), signals: session.signals }),
    { revalidateOnFocus: false, revalidateIfStale: false, shouldRetryOnError: false },
  );

  // -1 covers only, 0..n-1 highlight index, n converge
  const [step, setStep] = useState(-1);
  const [animationDone, setAnimationDone] = useState(false);
  const highlights = data?.highlights.slice(0, 3) ?? [];
  const converging = data ? step >= highlights.length : false;

  const positions = useMemo(() => layout(songs.length), [songs.length]);
  const colors = useMemo(() => songs.map(starColor), [songs]);
  const trail = useMemo(() => trailPath(positions), [positions]);
  const svgRef = useRef<SVGSVGElement>(null);
  const webgl = useWebGL();
  const reducedMotion = useReducedMotion();
  const use3D = webgl && !reducedMotion;

  // Ambient sky + kindle + comet pass. Runs as soon as the screen mounts, independent of the analysis.
  const sky = useAnime<HTMLDivElement>(
    (el) => {
      const q = <T extends Element>(s: string) => Array.from(el.querySelectorAll<T>(s));
      animate(q("[data-dust]"), { opacity: [() => utils.random(0.1, 0.35), () => utils.random(0.5, 1)], scale: [0.7, 1.4], duration: () => utils.random(1400, 3200), delay: () => utils.random(0, 2000), loop: true, alternate: true, ease: "inOutSine" });
      animate(q("[data-nebula]"), { translateX: () => utils.random(-24, 24), translateY: () => utils.random(-18, 18), scale: [1, 1.18], duration: 9000, loop: true, alternate: true, ease: "inOutSine" });

      const stars = q("[data-star]");
      const halos = q("[data-halo]");
      const names = q("[data-name]");
      const bursts = q("[data-burst]");
      const links = createDrawableList(q<SVGPathElement>("[data-link]"));
      utils.set(stars, { scale: 0, opacity: 0 });
      utils.set(halos, { scale: 0.4, opacity: 0 });
      utils.set(names, { opacity: 0, translateY: 4 });
      utils.set(bursts, { opacity: 0, scale: 0.2 });
      utils.set(links, { draw: "0 0" });

      const tl = createTimeline({ defaults: { ease: "outExpo" } });
      tl.add(stars, { scale: [0, 1], opacity: [0, 1], duration: 900, ease: "outElastic(1, .6)", delay: stagger(140) }, 200)
        .add(halos, { scale: [0.4, 1], opacity: [0, 0.55], duration: 1200, delay: stagger(140) }, 200);

      const stop = 1100;
      const t0 = 1400;
      const path = q<SVGPathElement>("[data-trail]")[0];
      const comet = q("[data-comet]")[0];
      if (path && comet && stars.length > 1) {
        const { translateX, translateY } = createMotionPath(path);
        utils.set(comet, { opacity: 0 });
        tl.add(comet, { opacity: [0, 1], duration: 400 }, t0 - 100)
          .add(comet, { translateX, translateY, duration: stop * (stars.length - 1), ease: "inOutSine" }, t0)
          .add(comet, { opacity: 0, duration: 500 }, t0 + stop * (stars.length - 1));
      }
      tl.add(names[0], { opacity: [0, 1], translateY: [4, 0], duration: 700 }, t0 + 100).add(bursts[0], { scale: [0.2, 3], opacity: [0.9, 0], duration: 1100, ease: "outQuart" }, t0);
      for (let b = 1; b < stars.length; b++) {
        const at = t0 + stop * b * 0.92;
        tl.add(links[b - 1], { draw: ["0 0", "0 1"], duration: 900, ease: "inOutQuad" }, at - 700)
          .add(bursts[b], { scale: [0.2, 3], opacity: [0.9, 0], duration: 1100, ease: "outQuart" }, at)
          .add(stars[b], { scale: [1, 1.5, 1], duration: 700, ease: "outBack" }, at)
          .add(names[b], { opacity: [0, 1], translateY: [4, 0], duration: 700 }, at + 100);
      }
    },
    [songs.length],
  );

  // Each insight arrives word by word.
  const caption = useAnime<HTMLDivElement>(
    (el) => {
      const p = el.querySelector("[data-caption]");
      if (!p) return;
      const { words } = splitText(p, { words: { wrap: "clip" } });
      animate(words, { translateY: ["105%", "0%"], opacity: [0, 1], duration: 900, delay: stagger(55), ease: "outExpo" });
    },
    [step, !!data],
  );

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      await wait(2200);
      for (let i = 0; i < data.highlights.slice(0, 3).length; i++) {
        if (cancelled) return;
        setStep(i);
        await wait(2600);
      }
      if (cancelled) return;
      setStep(99);
      await new Promise((r) => setTimeout(r, 1800));
      if (cancelled) return;
      setAnimationDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [data, wait]);

  // Each highlight flares one link (and the two stars on it) gold while its caption plays.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || step < 0 || step >= highlights.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const links = svg.querySelectorAll("[data-link]");
    const halos = svg.querySelectorAll("[data-halo]");
    const li = step % Math.max(links.length, 1);
    const anims = [
      ...(links[li] ? [animate(links[li], { stroke: [LINK_STROKE, GOLD], strokeWidth: [1.2, 2.6], duration: 700, alternate: true, loop: 2 })] : []),
      animate([halos[li], halos[li + 1]].filter(Boolean), { scale: [1, 1.7, 1], opacity: [0.55, 1, 0.55], duration: 1400, ease: "outExpo" }),
    ];
    return () => anims.forEach((a) => a.revert());
  }, [step, highlights.length]);

  // Converge: every star slides into one point of light, which blooms with sonar rings.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !converging || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const q = <T extends Element>(s: string) => Array.from(svg.querySelectorAll<T>(s));
    const tl = createTimeline({ defaults: { ease: "inOutCubic" } });
    tl.add(q("[data-name]"), { opacity: 0, duration: 500 }, 0).add(q("[data-link]"), { opacity: 0, duration: 900 }, 0);
    [...q("[data-star]"), ...q("[data-halo]")].forEach((t, i) => {
      const k = i % positions.length;
      tl.add(t, { translateX: CORE.x - positions[k][0], translateY: CORE.y - positions[k][1], ...(i < positions.length ? { scale: 0.2 } : {}), opacity: 0, duration: 1500 }, k * 40);
    });
    tl.add(q("[data-core]"), { scale: [0, 1], opacity: [0, 1], duration: 1400, ease: "outExpo" }, 1000).add(q("[data-core-ring]"), { scale: [0.4, 5], opacity: [0.7, 0], duration: 1600, ease: "outQuart", delay: stagger(220) }, 1200);
    return () => void tl.revert();
  }, [converging, positions]);

  // The feel screen starts saving the described songs as it hands off here. Only move on once
  // that's done, so nobody reaches the galaxy with half their picks missing.
  const saving = session.saveStatus === "saving";
  const saveFailed = session.saveStatus === "error";
  useEffect(() => {
    if (!animationDone || !data || saving || saveFailed) return;
    setSession({ analysis: data, motivations: data.motivations });
    router.replace("/onboarding/why");
  }, [animationDone, data, saving, saveFailed, router]);

  if (animationDone && saveFailed) {
    return (
      <main className="starfield flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-2xl font-semibold tracking-tight">We couldn&apos;t save all your songs.</p>
        <p className="text-sm text-muted-foreground">{session.saveError ?? "Something went wrong on our end."} The ones already saved are kept.</p>
        <Button className="mt-2 h-11 rounded-full px-6" onClick={() => void saveSongs()}>
          Try again
        </Button>
      </main>
    );
  }

  if (error) {
    return (
      <main className="starfield flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-2xl font-semibold tracking-tight">We couldn&apos;t get through your songs just now.</p>
        <p className="text-sm text-muted-foreground">Your songs are saved. Give it another try.</p>
        {/* The error stays up while retrying, so the button itself has to show that something is happening. */}
        <Button className="mt-2 h-11 rounded-full px-6" disabled={isValidating} onClick={() => mutate()}>
          {isValidating ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Trying again…
            </>
          ) : (
            "Try again"
          )}
        </Button>
      </main>
    );
  }

  const currentHighlight = step >= 0 && step < highlights.length ? highlights[step] : undefined;
  const total = highlights.length + 2;
  const demoStep = !data ? 0 : step < 0 ? 0 : Math.min(step + 1, total - 1);

  return (
    <main className="starfield relative flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-5">
        <Logo />
        {session.demo ? <DemoSteps total={total} current={demoStep} /> : null}
      </div>

      <button type="button" onClick={advance} aria-label="Continue" className="absolute inset-0 z-10 cursor-default focus-visible:outline-none" />

      <div ref={sky} className="relative flex-1" aria-hidden>
        {use3D ? (
          <ReadingConstellationScene songs={songs} step={step} highlightCount={highlights.length} converging={converging} />
        ) : (
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full">
          <defs>
            <filter id="rs-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="rs-soft" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="28" />
            </filter>
            <radialGradient id="rs-halo">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g filter="url(#rs-soft)" opacity="0.5">
            {positions.filter((_, i) => i % 3 === 0).map(([x, y], j) => (
              <circle key={j} data-nebula cx={x} cy={y} r="72" fill={colors[j * 3]} opacity="0.32" />
            ))}
          </g>

          {DUST.map((d, i) => (
            <circle key={i} data-dust cx={d.x} cy={d.y} r={d.r} fill="#fff" opacity="0.3" />
          ))}

          <path data-trail d={trail} fill="none" stroke="none" />

          <g filter="url(#rs-glow)">
            {positions.slice(1).map(([x, y], i) => (
              <path key={i} data-link d={`M ${positions[i][0]} ${positions[i][1]} L ${x} ${y}`} stroke={LINK_STROKE} strokeWidth="1.2" strokeLinecap="round" fill="none" className={cn(converging && "motion-reduce:opacity-0")} />
            ))}
          </g>

          {positions.map(([x, y], i) => (
            <g key={songs[i].id} transform={`translate(${x} ${y})`} className={cn(converging && "motion-reduce:opacity-0")}>
              <circle data-halo r="26" fill="url(#rs-halo)" opacity="0.5" />
              <circle data-burst r="10" fill="none" stroke={colors[i]} strokeWidth="1.2" opacity="0" />
              <g data-star filter="url(#rs-glow)" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
                <circle r="9" fill={colors[i]} />
                <circle r="9" fill="none" stroke={GOLD} strokeOpacity="0.8" strokeWidth="1" />
                <circle r="3" fill="#fff" opacity="0.9" />
              </g>
              <text data-name y="26" textAnchor="middle" className="fill-foreground/70" style={{ fontSize: 9.5 }}>
                {songs[i].title.length > 20 ? `${songs[i].title.slice(0, 19)}…` : songs[i].title}
              </text>
            </g>
          ))}

          <g data-comet filter="url(#rs-glow)" opacity="0" style={{ transformBox: "fill-box" }}>
            <circle r="14" fill={GOLD} opacity="0.25" />
            <circle r="4" fill="#fff6dc" />
          </g>

          <g transform={`translate(${CORE.x} ${CORE.y})`}>
            <circle data-core-ring r="10" fill="none" stroke={GOLD} strokeWidth="1" opacity="0" />
            <circle data-core-ring r="10" fill="none" stroke={GOLD} strokeWidth="1" opacity="0" />
            <circle data-core r="6" fill={GOLD} filter="url(#rs-glow)" opacity="0" className={cn(converging && "motion-reduce:opacity-100")} />
          </g>
        </svg>
        )}
      </div>

      <div ref={caption} className="relative min-h-40 px-8 pb-16 text-center" aria-live="polite">
        {currentHighlight ? (
          <p key={currentHighlight} data-caption className="text-balance text-[26px] leading-snug">
            {currentHighlight}
          </p>
        ) : converging ? (
          <>
            <p key="converge" data-caption className="text-xl font-medium tracking-tight text-muted-foreground">Here&apos;s a first pass.</p>
            {animationDone && saving ? <p className="mt-3 text-sm text-muted-foreground">Saving your songs…</p> : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Going through your songs…</p>
        )}
      </div>
    </main>
  );
}

function createDrawableList(paths: SVGPathElement[]) {
  return paths.map((p) => createDrawable(p));
}
