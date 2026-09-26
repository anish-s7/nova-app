"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Dices, Pause, Play, Sparkles, X } from "lucide-react";
import { GalaxySkeleton } from "@/components/galaxy/galaxy-canvas";
import { GalaxySvg } from "@/components/galaxy/galaxy-svg";
import type { GalaxyApi } from "@/components/galaxy/types";
import { useReducedMotion, useWebGL } from "@/hooks/use-capabilities";
import { CLUSTER_IDS, CLUSTERS } from "@/lib/clusters";
import {
  EVENT_LABELS,
  PRESETS,
  Simulation,
  mulberry32,
  newSeed,
  randomScenario,
  type Scenario,
  type SimEvent,
  type Snapshot,
} from "@/lib/sim/engine";
import type { LearningPoint, LearningStats } from "@/lib/sim/learner";
import { FEATURES, SONGS, type SimUser } from "@/lib/sim/model";
import { cn } from "@/lib/utils";

const GalaxyScene = dynamic(() => import("@/components/galaxy/galaxy-scene"), {
  ssr: false,
  loading: () => <GalaxySkeleton />,
});

const TICK_MS = 250;
const SPEEDS = [1, 2, 4] as const;
const EVENTS = Object.keys(EVENT_LABELS) as SimEvent[];
/** Below this many points of match quality, a different EMOTION_WEIGHT is not worth calling out; it is within the noise. */
const MEANINGFUL_GAP = 0.08;
const SURPRISE_EVERY = [14, 28] as const;

const scenarioFor = (id: string | null, seed: number): Scenario =>
  PRESETS.find((p) => p.id === id) ?? randomScenario(mulberry32(seed));

export default function SimPage() {
  const sim = useRef<Simulation | null>(null);
  const apiRef = useRef<GalaxyApi | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [surprise, setSurprise] = useState(false);
  const [tab, setTab] = useState<"controls" | "learning" | "matcher">("controls");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nextSurprise = useRef(0);
  const reduced = useReducedMotion();
  const webgl = useWebGL();

  const start = useCallback((scenarioId: string | null, seedIn?: number) => {
    const seed = seedIn ?? newSeed();
    sim.current = new Simulation(scenarioFor(scenarioId, seed), seed);
    nextSurprise.current = SURPRISE_EVERY[0];
    setSnap(sim.current.snapshot());
    setSelectedId(null);
    setRun((r) => r + 1);
    // The URL carries the run, so a good one can be replayed by sharing the link.
    const q = new URLSearchParams(location.search);
    q.set("s", scenarioId ?? "random");
    q.set("seed", String(seed));
    history.replaceState(null, "", `?${q}`);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const seed = Number(q.get("seed"));
    start(
      q.get("s") ?? "slow_burn",
      Number.isFinite(seed) && seed > 0 ? seed : undefined,
    );
  }, [start]);

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    const t = setInterval(() => {
      const s = sim.current;
      if (!s) return;
      s.step((TICK_MS / 1000) * speed);
      if (surprise && s.clock >= nextSurprise.current) {
        s.trigger(EVENTS[Math.floor(Math.random() * EVENTS.length)]);
        nextSurprise.current =
          s.clock +
          SURPRISE_EVERY[0] +
          Math.random() * (SURPRISE_EVERY[1] - SURPRISE_EVERY[0]);
      }
      setSnap(s.snapshot());
    }, TICK_MS);
    return () => clearInterval(t);
  }, [playing, visible, speed, surprise]);

  // The scene fits its camera to the canvas at mount, before the flex layout has settled. Re-frame once it has,
  // and whenever the window changes, so the whole galaxy is in view.
  useEffect(() => {
    if (!run) return;
    const reframe = () => apiRef.current?.pullBackToOverview(0);
    const t = setTimeout(reframe, 400);
    window.addEventListener("resize", reframe);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", reframe);
    };
  }, [run]);

  const fire = (e: SimEvent) => {
    sim.current?.trigger(e);
    if (sim.current) setSnap(sim.current.snapshot());
  };

  const select = (id: string | null) => {
    setSelectedId(id);
    if (id)
      apiRef.current?.flyTo(id, { duration: 900, distance: 14, lift: 0.15 });
    else apiRef.current?.recenter();
  };

  const forceSvg = typeof location !== "undefined" && new URLSearchParams(location.search).get("view") === "svg";
  const View = reduced || !webgl || forceSvg ? GalaxySvg : GalaxyScene;
  const selected = snap && selectedId ? snap.users.get(selectedId) : undefined;
  const extra = useMemo(() => [], []);
  const latest = snap?.feed[0];
  const mins = snap
    ? `${Math.floor(snap.clock / 60)}:${String(Math.floor(snap.clock % 60)).padStart(2, "0")}`
    : "0:00";

  return (
    <main className="relative flex min-h-0 flex-1 flex-col">
      <header className="relative z-10 flex flex-col gap-2 p-4 pt-5">
        <div className="pointer-events-auto flex items-center justify-between">
          <Link
            href="/"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Song Galaxy · live simulation
          </Link>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-muted-foreground">
            Simulated. Not real users.
          </span>
        </div>
        {snap ? (
          <dl className="grid grid-cols-5 gap-1 text-center">
            <Stat label="People" value={snap.stats.users} />
            <Stat label="Joined" value={snap.stats.joined} />
            <Stat label="Left" value={snap.stats.left} />
            <Stat label="Clicks" value={snap.stats.matches} />
            <Stat label="Groups" value={snap.stats.communities} />
          </dl>
        ) : null}
        <div className="h-4">
          {latest ? (
            <p
              key={latest.id}
              className={cn(
                "truncate text-[12px] italic motion-safe:animate-in motion-safe:fade-in",
                latest.kind === "event"
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              {latest.text}
            </p>
          ) : null}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 starfield">
        {snap ? (
          <View
            key={run}
            nodes={snap.nodes}
            edges={snap.edges}
            layout={snap.layout}
            extra={extra}
            selectedId={selectedId}
            onSelect={select}
            apiRef={apiRef}
            fading={snap.fading}
          />
        ) : (
          <GalaxySkeleton />
        )}
        {selected ? <PersonCard user={selected} onClose={() => select(null)} /> : null}
      </div>

      <div className="relative z-10 flex flex-col gap-3 border-t border-white/5 bg-background p-4">
        <div
          className="flex gap-1 self-start rounded-full bg-white/5 p-0.5 text-[12px]"
          role="tablist"
        >
          {(["controls", "learning", "matcher"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full px-3 py-1 capitalize",
                tab === t ? "bg-white/10" : "text-muted-foreground",
              )}
            >
              {t === "matcher" ? "Real matcher" : t}
            </button>
          ))}
        </div>

        <div className="h-[clamp(170px,30dvh,250px)] overflow-y-auto overflow-x-hidden">
          {tab === "controls" ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-[11px] text-muted-foreground">
                  Trigger
                </span>
                {EVENTS.map((e) => (
                  <button
                    key={e}
                    onClick={() => fire(e)}
                    className="rounded-full border border-white/10 px-2.5 py-1 text-[12px] hover:bg-white/5"
                  >
                    {EVENT_LABELS[e]}
                  </button>
                ))}
                <button
                  onClick={() => setSurprise((v) => !v)}
                  aria-pressed={surprise}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]",
                    surprise
                      ? "bg-primary text-primary-foreground"
                      : "border border-white/10 hover:bg-white/5",
                  )}
                >
                  <Sparkles className="size-3.5" /> Surprise me
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => start(p.id)}
                    title={p.blurb}
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[12px]",
                      snap?.scenario.id === p.id
                        ? "bg-primary text-primary-foreground"
                        : "border border-white/10 hover:bg-white/5",
                    )}
                  >
                    {p.name}
                  </button>
                ))}
                <button
                  onClick={() => start(null)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]",
                    snap?.scenario.id === "random"
                      ? "bg-primary text-primary-foreground"
                      : "border border-white/10 hover:bg-white/5",
                  )}
                >
                  <Dices className="size-3.5" /> Randomize
                </button>
              </div>
            </div>
          ) : snap ? (
            tab === "learning" ? (
              <LearningPanel l={snap.learning} />
            ) : (
              <MatcherPanel l={snap.learning} />
            )
          ) : null}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause" : "Play"}
            className="flex size-8 items-center justify-center rounded-full border border-white/10"
          >
            {playing ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </button>
          <p className="px-3 text-center text-[11px] leading-snug text-muted-foreground">
            {snap?.scenario.blurb}
            <span className="block tabular-nums opacity-60">
              {mins} · seed {snap?.seed}
            </span>
          </p>
          <div className="flex gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={cn(
                  "rounded-full px-2 py-1 text-[11px]",
                  speed === s ? "bg-white/10" : "text-muted-foreground",
                )}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function PersonCard({ user, onClose }: { user: SimUser; onClose: () => void }) {
  return (
    <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/10 bg-background/85 p-3 backdrop-blur">
      <div className="flex items-center justify-between">
        <p className="font-serif text-base">{user.name}</p>
        <button onClick={onClose} aria-label="Close" className="text-muted-foreground">
          <X className="size-4" />
        </button>
      </div>
      <div className="my-2 flex h-1.5 overflow-hidden rounded-full">
        {CLUSTER_IDS.map((id, i) => (user.taste[i] > 0.04 ? <span key={id} style={{ flex: user.taste[i], background: CLUSTERS[id].color }} /> : null))}
      </div>
      <ul className="text-[11px] leading-snug text-muted-foreground">
        {user.picks.slice(0, 4).map((p, i) => (
          <li key={i} className="truncate">
            {SONGS[p.song].title} <span className="opacity-60">· {SONGS[p.song].artist}</span>
          </li>
        ))}
        {user.picks.length > 4 ? <li className="opacity-60">and {user.picks.length - 4} more</li> : null}
      </ul>
    </div>
  );
}

/** The production formula tried in this world: how good its picks are at each EMOTION_WEIGHT. */
function MatcherPanel({ l }: { l: LearningStats }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (!l.sweep.length) return <p className="text-[11px] text-muted-foreground">Warming up. This needs a few dozen match attempts.</p>;
  const best = l.sweep.reduce((b, x) => (x.quality > b.quality ? x : b));
  const prod = l.sweep.find((x) => x.weight === l.productionWeight) ?? l.sweep[0];
  const top = Math.max(...l.sweep.map((x) => x.quality), 0.01);
  const noMood = l.sweep.find((x) => x.weight === 0)?.quality ?? prod.quality;
  // Above a small weight the ranking barely changes, so the honest question is usually whether mood is in the mix at all.
  const headline =
    best.quality - prod.quality >= MEANINGFUL_GAP
      ? `Best here: EMOTION_WEIGHT ${best.weight}, not ${l.productionWeight}`
      : noMood - prod.quality >= MEANINGFUL_GAP
        ? "Mood is hurting here: content alone does better"
        : prod.quality - noMood >= MEANINGFUL_GAP
          ? `Mood matters here: leaving it out costs ${Math.round((prod.quality - noMood) * 100)} points`
          : "Little difference in this world";
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-serif text-lg leading-tight">{headline}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          The real matcher&apos;s formula, run in this world. Its top picks click {pct(prod.quality)} of the time at {l.productionWeight}
          {best.weight !== prod.weight ? `, ${pct(best.quality)} at ${best.weight}` : ""}.
        </p>
      </div>
      <div className="flex flex-col gap-1">
        {l.sweep.map((x) => (
          <div key={x.weight} className="flex items-center gap-2 text-[10px] leading-none">
            <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
              {x.weight}
              {x.weight === l.productionWeight ? " (today)" : ""}
            </span>
            <div className="h-1.5 flex-1 rounded-full bg-white/8">
              <div className={cn("h-full rounded-full transition-all duration-500", x.weight === best.weight ? "bg-primary" : "bg-white/35")} style={{ width: `${(x.quality / top) * 100}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right tabular-nums">{pct(x.quality)}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground">
        Directional only. Outcomes are simulated, and the demo&apos;s vectors are 128-d where production&apos;s are 768-d, so the shape of this curve carries over and the exact number does not. The best weight differs run to run.
      </p>
    </div>
  );
}

function LearningPanel({ l }: { l: LearningStats }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const gap = l.ceiling - l.fixed;
  // How much of the distance between "never learned" and "best possible" it has covered.
  const closed =
    gap > 0.04 ? Math.max(0, Math.min(1, (l.learned - l.fixed) / gap)) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-serif text-2xl tabular-nums leading-none">
            {pct(l.learned)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            of its picks click. Never learned: {pct(l.fixed)}. Best possible:{" "}
            {pct(l.ceiling)}.
          </p>
        </div>
        <p className="shrink-0 text-right text-[11px] text-muted-foreground">
          <span className="tabular-nums text-foreground">
            {closed === null
              ? "Already close"
              : `${Math.round(closed * 100)}% of gap`}
          </span>
          <span className="block tabular-nums">{l.attempts} tries</span>
        </p>
      </div>
      <Sparkline points={l.history} />
      <div className="flex flex-col gap-1">
        <p className="text-[11px] text-muted-foreground">
          Learned weights. The tick is the hidden truth.
          {l.moodPerContent !== null
            ? ` This run, mood counts ${l.moodPerContent.toFixed(1)}x song content.`
            : ""}
        </p>
        {FEATURES.map((name, i) => (
          <div
            key={name}
            className="flex items-center gap-2 text-[10px] leading-none"
          >
            <span className="w-32 shrink-0 truncate text-muted-foreground">
              {name}
            </span>
            <WeightBar learned={l.weights[i]} truth={l.truth[i]} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A bar centered on zero for a learned weight, with a tick for the true weight. Range is -1..1. */
function WeightBar({ learned, truth }: { learned: number; truth: number }) {
  const at = (v: number) => `${50 + v * 50}%`;
  return (
    <div className="relative h-1.5 flex-1 rounded-full bg-white/8">
      <span
        className="absolute inset-y-0 w-px bg-white/25"
        style={{ left: "50%" }}
      />
      <span
        className="absolute inset-y-0 rounded-full bg-primary transition-all duration-500"
        style={{
          left: learned >= 0 ? "50%" : at(learned),
          width: `${Math.abs(learned) * 50}%`,
        }}
      />
      <span
        className="absolute -inset-y-0.5 w-0.5 rounded bg-foreground transition-all duration-500"
        style={{ left: at(truth) }}
      />
    </div>
  );
}

function Sparkline({ points }: { points: LearningPoint[] }) {
  const W = 320;
  const H = 40;
  if (points.length < 2) return <div className="h-10 rounded-lg bg-white/5" />;
  const line = (key: keyof LearningPoint) =>
    points
      .map(
        (p, i) =>
          `${((i / (points.length - 1)) * W).toFixed(1)},${(H - 4 - p[key] * (H - 8)).toFixed(1)}`,
      )
      .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-10 w-full rounded-lg bg-white/5"
      role="img"
      aria-label="Match quality of the learning matcher over time, against a fixed matcher and the best possible"
    >
      <polyline
        points={line("ceiling")}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1"
        strokeDasharray="1 3"
        className="text-foreground"
      />
      <polyline
        points={line("fixed")}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        className="text-foreground"
      />
      <polyline
        points={line("learned")}
        fill="none"
        strokeWidth="2"
        strokeLinejoin="round"
        className="stroke-primary"
      />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dd className="font-serif text-lg tabular-nums leading-none">{value}</dd>
      <dt className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
    </div>
  );
}
