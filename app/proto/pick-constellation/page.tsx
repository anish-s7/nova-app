"use client";

/**
 * PROTOTYPE — not shipped. Simulation route for the "pick a song → it flies up
 * into a forming constellation" onboarding animation. Uses the real song catalog,
 * cluster colors, and anime.js so the motion here is the motion we'd ship.
 *
 * Delete app/proto once the animation is approved and lifted into
 * app/onboarding/pick/page.tsx.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { animate, createMotionPath, stagger, utils } from "animejs";
import { Check, Plus, RotateCcw } from "lucide-react";
import { getCluster } from "@/lib/galaxy/clusters";
import { contextFor, SONG_CATALOG } from "@/lib/music/music-context";
import type { Song } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const MIN = 5;
const MAX = 10;

/** A picked song, plus whether its fly-in has finished (so the persistent star shows). */
type Pick = Song & { _landed?: boolean };

/** Dominant cluster color for a song → the color its star becomes. */
function starColor(songId: string): string {
  const clusters = contextFor(songId).clusters;
  let best = "";
  let bestW = -1;
  for (const [id, w] of Object.entries(clusters)) {
    if ((w ?? 0) > bestW) {
      bestW = w ?? 0;
      best = id;
    }
  }
  return getCluster(best).color;
}

/** Where a landed star sits inside the constellation zone, as a fraction (0..1). */
function slot(index: number, total: number) {
  // Golden-angle scatter so points spread out instead of stacking in a line.
  const golden = 2.399963;
  const a = index * golden;
  const r = total <= 1 ? 0 : 0.14 + 0.34 * Math.sqrt(index / Math.max(1, total - 1));
  return { fx: 0.5 + Math.cos(a) * r * 0.9, fy: 0.5 + Math.sin(a) * r * 0.62 };
}

type Knobs = {
  arc: number; // px the flight bows upward
  duration: number; // ms flight time
  stagger: number; // ms between multi-adds (kept for parity, single adds here)
  starSize: number; // px landed star diameter
  links: boolean; // draw links between landed stars
};

const DEFAULT_KNOBS: Knobs = { arc: 120, duration: 900, stagger: 60, starSize: 14, links: true };

export default function PickConstellationProto() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [knobs, setKnobs] = useState<Knobs>(DEFAULT_KNOBS);
  const [flareKey, setFlareKey] = useState(0);

  const skyRef = useRef<HTMLDivElement>(null);
  const flyLayerRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const crossedMin = useRef(false);

  const results = useMemo(() => SONG_CATALOG.slice(0, 24), []);
  const isPicked = useCallback((id: string) => picks.some((s) => s.id === id), [picks]);
  const count = picks.length;

  const positionsFor = (list: Pick[]) => {
    const sky = skyRef.current;
    if (!sky) return new Map<string, { x: number; y: number }>();
    const rect = sky.getBoundingClientRect();
    const m = new Map<string, { x: number; y: number }>();
    list.forEach((s, i) => {
      const { fx, fy } = slot(i, list.length);
      m.set(s.id, { x: fx * rect.width, y: fy * rect.height });
    });
    return m;
  };

  /** Animate album art from its tapped row, arcing up, shrinking into a colored star. */
  const flyIn = (song: Song, landing: { x: number; y: number }) => {
    const sky = skyRef.current;
    const layer = flyLayerRef.current;
    const row = rowRefs.current.get(song.id);
    if (!sky || !layer || !row) return;

    const skyRect = sky.getBoundingClientRect();
    const artEl = row.querySelector<HTMLElement>("[data-art]");
    const from = (artEl ?? row).getBoundingClientRect();

    const startX = from.left - skyRect.left + from.width / 2;
    const startY = from.top - skyRect.top + from.height / 2;

    // A temporary flyer that lives only for the flight.
    const flyer = document.createElement("div");
    flyer.className = "pointer-events-none absolute left-0 top-0 will-change-transform";
    flyer.style.width = `${from.width}px`;
    flyer.style.height = `${from.height}px`;
    const color = starColor(song.id);
    flyer.innerHTML = `
      <div data-shell class="relative size-full overflow-hidden rounded-lg ring-1 ring-white/15" style="background:${color}">
        ${song.albumArtUrl ? `<img src="${song.albumArtUrl}" alt="" class="size-full object-cover" />` : ""}
      </div>
      <div data-star class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0"
           style="width:${knobs.starSize}px;height:${knobs.starSize}px;background:radial-gradient(circle, #fff 0%, ${color} 45%, transparent 72%);box-shadow:0 0 14px 3px ${color}"></div>`;
    layer.appendChild(flyer);
    utils.set(flyer, { translateX: startX, translateY: startY });

    // Bezier flight path that bows upward, ending at the landing slot.
    const midX = (startX + landing.x) / 2;
    const topY = Math.min(startY, landing.y) - knobs.arc;
    const pathHost = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    pathHost.setAttribute("width", "0");
    pathHost.setAttribute("height", "0");
    pathHost.style.position = "absolute";
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", `M ${startX} ${startY} Q ${midX} ${topY} ${landing.x} ${landing.y}`);
    pathHost.appendChild(path);
    layer.appendChild(pathHost);

    const motion = createMotionPath(path);

    animate(flyer, {
      translateX: motion.translateX,
      translateY: motion.translateY,
      duration: knobs.duration,
      ease: "inOutQuad",
    });
    // Album art shrinks and fades as the star core blooms — the hybrid handoff.
    animate(flyer.querySelector("[data-shell]")!, {
      scale: [1, 0.2],
      opacity: [1, 0],
      borderRadius: ["12px", "50%"],
      duration: knobs.duration,
      ease: "inQuad",
    });
    animate(flyer.querySelector("[data-star]")!, {
      opacity: [0, 1],
      scale: [0.3, 1],
      delay: knobs.duration * 0.45,
      duration: knobs.duration * 0.55,
      ease: "outBack",
      onComplete: () => {
        // Hand off to the persistent React star, then clean up the flyer.
        setPicks((prev) => prev.map((s) => (s.id === song.id ? { ...s, _landed: true } : s)));
        flyer.remove();
        pathHost.remove();
      },
    });
  };

  const relayoutStars = (list: Pick[]) => {
    const pos = positionsFor(list);
    list.forEach((s) => {
      const el = document.querySelector<HTMLElement>(`[data-landed="${s.id}"]`);
      const p = pos.get(s.id);
      if (el && p) animate(el, { left: p.x, top: p.y, duration: 500, ease: "outQuad" });
    });
  };

  const addSong = (song: Song) => {
    if (count >= MAX || isPicked(song.id)) return;
    const next = [...picks, song];
    const landing = positionsFor(next).get(song.id)!;
    setPicks(next);
    // Existing stars drift to make room; the new one flies in.
    requestAnimationFrame(() => {
      relayoutStars(picks);
      flyIn(song, landing);
    });

    if (next.length === MIN && !crossedMin.current) {
      crossedMin.current = true;
      setFlareKey((k) => k + 1);
      requestAnimationFrame(() => {
        if (ctaRef.current) {
          animate(ctaRef.current, { scale: [1, 1.06, 1], duration: 700, ease: "outElastic(1, .6)" });
        }
        animate("[data-landed]", { scale: [1, 1.5, 1], duration: 900, delay: stagger(40), ease: "inOutQuad" });
      });
    }
  };

  const removeSong = (song: Song) => {
    const next = picks.filter((s) => s.id !== song.id);
    setPicks(next);
    if (next.length < MIN) crossedMin.current = false;
    requestAnimationFrame(() => relayoutStars(next));
  };

  const reset = () => {
    setPicks([]);
    crossedMin.current = false;
    setFlareKey(0);
  };

  const links = useMemo(() => {
    if (!knobs.links || picks.length < 2) return [];
    const out: [string, string][] = [];
    for (let i = 1; i < picks.length; i++) out.push([picks[i - 1].id, picks[i].id]);
    return out;
  }, [picks, knobs.links]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-night text-foreground">
      <div className="flex items-center justify-between px-5 pt-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Prototype</p>
          <h1 className="text-lg font-semibold">Pick → constellation</h1>
        </div>
        <button onClick={reset} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
          <RotateCcw className="size-3.5" aria-hidden /> Reset
        </button>
      </div>

      {/* Constellation sky */}
      <div ref={skyRef} className="starfield relative mx-5 mt-4 h-56 shrink-0 overflow-hidden rounded-3xl ring-1 ring-white/[0.06]">
        <div ref={flyLayerRef} className="pointer-events-none absolute inset-0 z-20" aria-hidden />

        {/* Links between landed stars */}
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          {links.map(([a, b]) => (
            <LinkLine key={`${a}-${b}`} a={a} b={b} skyRef={skyRef} picks={picks} />
          ))}
        </svg>

        {/* Persistent landed stars */}
        {(() => {
          const positions = positionsFor(picks);
          return picks.map((s) => {
            const pos = positions.get(s.id) ?? { x: 0, y: 0 };
            const color = starColor(s.id);
            return (
            <span
              key={s.id}
              data-landed={s.id}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: knobs.starSize,
                  height: knobs.starSize,
                  background: `radial-gradient(circle, #fff 0%, ${color} 45%, transparent 72%)`,
                  boxShadow: `0 0 14px 3px ${color}`,
                  opacity: s._landed ? 1 : 0,
                }}
              />
            );
          });
        })()}

        {count === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center px-8 text-center font-serif text-base italic text-muted-foreground">
            Pick songs below and watch your constellation form.
          </p>
        ) : null}

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs tabular-nums text-muted-foreground">
          <span className={cn("font-semibold", count >= MIN ? "text-primary" : "text-foreground")}>{count}</span>/{MAX}
        </div>
      </div>

      {/* CTA */}
      <div className="px-5 pt-4">
        <button
          ref={ctaRef}
          key={flareKey}
          disabled={count < MIN}
          className={cn(
            "h-12 w-full rounded-full text-base font-medium transition-colors disabled:opacity-50",
            count >= MIN ? "btn-glow bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
          )}
        >
          {count < MIN ? `Pick ${MIN - count} more` : "Read my music"}
        </button>
      </div>

      {/* Song list */}
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <ul className="flex flex-col">
          {results.map((song) => {
            const picked = isPicked(song.id);
            const full = !picked && count >= MAX;
            const color = starColor(song.id);
            return (
              <li key={song.id}>
                <button
                  ref={(el) => {
                    if (el) rowRefs.current.set(song.id, el);
                    else rowRefs.current.delete(song.id);
                  }}
                  onClick={() => (picked ? removeSong(song) : addSong(song))}
                  disabled={full}
                  aria-pressed={picked}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5 disabled:opacity-40"
                >
                  <span data-art className="relative size-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10" style={{ background: color }}>
                    {song.albumArtUrl ? <Image src={song.albumArtUrl} alt="" fill sizes="44px" className="object-cover" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold leading-tight">{song.title}</span>
                    <span className="block truncate text-sm text-muted-foreground">{song.artist}</span>
                  </span>
                  <span className={cn("inline-flex size-8 items-center justify-center rounded-full border", picked ? "border-primary bg-primary text-primary-foreground" : "border-white/15 text-muted-foreground")}>
                    {picked ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Tuning knobs */}
      <TuningPanel knobs={knobs} setKnobs={setKnobs} />
    </div>
  );
}

function LinkLine({ a, b, skyRef, picks }: { a: string; b: string; skyRef: React.RefObject<HTMLDivElement | null>; picks: Pick[] }) {
  const sky = skyRef.current;
  if (!sky) return null;
  const rect = sky.getBoundingClientRect();
  const idx = (id: string) => picks.findIndex((s) => s.id === id);
  const golden = 2.399963;
  const point = (id: string) => {
    const i = idx(id);
    const total = picks.length;
    const ang = i * golden;
    const r = total <= 1 ? 0 : 0.14 + 0.34 * Math.sqrt(i / Math.max(1, total - 1));
    return { x: (0.5 + Math.cos(ang) * r * 0.9) * rect.width, y: (0.5 + Math.sin(ang) * r * 0.62) * rect.height };
  };
  const pa = point(a);
  const pb = point(b);
  const landed = (id: string) => picks.find((s) => s.id === id)?._landed;
  if (!landed(a) || !landed(b)) return null;
  return <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="white" strokeOpacity="0.14" strokeWidth="0.8" />;
}

function TuningPanel({ knobs, setKnobs }: { knobs: Knobs; setKnobs: React.Dispatch<React.SetStateAction<Knobs>> }) {
  const row = (label: string, key: keyof Knobs, min: number, max: number, step: number, unit = "") =>
    typeof knobs[key] === "number" ? (
      <label className="flex items-center gap-3 text-sm">
        <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={knobs[key] as number}
          onChange={(e) => setKnobs((k) => ({ ...k, [key]: Number(e.target.value) }))}
          className="flex-1 accent-primary"
        />
        <span className="w-14 shrink-0 text-right tabular-nums">{knobs[key] as number}{unit}</span>
      </label>
    ) : null;

  return (
    <details className="border-t border-white/10 bg-card/40 px-5 py-3" open>
      <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wider text-muted-foreground">Tuning</summary>
      <div className="mt-3 flex flex-col gap-2.5">
        {row("Arc height", "arc", 0, 240, 10, "px")}
        {row("Flight time", "duration", 300, 1800, 50, "ms")}
        {row("Stagger", "stagger", 0, 200, 10, "ms")}
        {row("Star size", "starSize", 6, 28, 1, "px")}
        <label className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 text-muted-foreground">Links</span>
          <input type="checkbox" checked={knobs.links} onChange={(e) => setKnobs((k) => ({ ...k, links: e.target.checked }))} className="size-4 accent-primary" />
        </label>
      </div>
    </details>
  );
}
