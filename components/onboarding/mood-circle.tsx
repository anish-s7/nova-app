"use client";

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { clampEmotionValue } from "@/lib/music/emotion";
import { cn } from "@/lib/utils";

export type Mood = { valence: number; energy: number };

const STEP = 0.1;
const BIG_STEP = 0.25;

/** Keep the point inside the unit circle, then round so stored values stay tidy. */
function clampToCircle(valence: number, energy: number): Mood {
  const r = Math.hypot(valence, energy);
  const scale = r > 1 ? 1 / r : 1;
  const round = (v: number) => Math.round(clampEmotionValue(v * scale) * 100) / 100;
  return { valence: round(valence), energy: round(energy) };
}

function pointTransform(mood: Mood, size: number) {
  return `translate(-50%, -50%) translate(${mood.valence * size / 2}px, ${-mood.energy * size / 2}px)`;
}

function word(v: number, low: string, high: string, mid: string) {
  if (v <= -0.5) return low;
  if (v < -0.15) return `a little ${low}`;
  if (v <= 0.15) return mid;
  if (v < 0.5) return `a little ${high}`;
  return high;
}

export function describeMood({ valence, energy }: Mood) {
  return `${word(valence, "sad", "happy", "neither sad nor happy")}, ${word(energy, "calm", "intense", "steady")}`;
}

/**
 * One point on a circle: left↔right is sad↔happy (valence), bottom↔top is calm↔intense (energy).
 * Drag or tap to place; arrow keys nudge (Shift for bigger steps). Output is -1..1 on both axes.
 */
export function MoodCircle({
  value,
  placed,
  onChange,
  label,
  size = 232,
}: {
  value: Mood;
  placed: boolean;
  onChange: (mood: Mood) => void;
  label: string;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pointRef = useRef<HTMLSpanElement>(null);
  const boundsRef = useRef<DOMRect | null>(null);
  const pendingRef = useRef<Mood>(value);
  const frameRef = useRef<number | null>(null);

  const paint = (mood: Mood) => {
    if (pointRef.current) pointRef.current.style.transform = pointTransform(mood, size);
  };

  const schedulePaint = (mood: Mood) => {
    pendingRef.current = mood;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paint(pendingRef.current);
    });
  };

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const rect = boundsRef.current;
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    schedulePaint(clampToCircle(x, -y));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    boundsRef.current = e.currentTarget.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    fromPointer(e);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e);
  };

  const commitPointer = (e?: PointerEvent<HTMLDivElement>) => {
    if (e) fromPointer(e);
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    paint(pendingRef.current);
    onChange(pendingRef.current);
    boundsRef.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? BIG_STEP : STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    onChange(clampToCircle(value.valence + move[0], value.energy + move[1]));
  };

  useEffect(() => {
    const next = { valence: value.valence, energy: value.energy };
    pendingRef.current = next;
    if (pointRef.current && !boundsRef.current) pointRef.current.style.transform = pointTransform(next, size);
  }, [value.valence, value.energy, size]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">How does it make you feel?</p>
      <div className="relative mt-3" style={{ width: size + 64, height: size + 40 }}>
        <span className="absolute left-1/2 top-0 -translate-x-1/2 text-xs text-muted-foreground">intense</span>
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">calm</span>
        <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">sad</span>
        <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">happy</span>

        <div
          ref={ref}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuetext={placed ? describeMood(value) : "Not placed yet. Use the arrow keys or tap the circle."}
          aria-valuenow={value.valence}
          aria-valuemin={-1}
          aria-valuemax={1}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={commitPointer}
          onPointerCancel={() => commitPointer()}
          onKeyDown={onKeyDown}
          className="absolute left-8 top-5 cursor-crosshair touch-none select-none rounded-full border border-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          style={{
            width: size,
            height: size,
            background:
              "radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 70%), conic-gradient(from 45deg, oklch(0.55 0.12 30 / 0.18), oklch(0.6 0.12 90 / 0.18), oklch(0.55 0.1 200 / 0.18), oklch(0.5 0.1 280 / 0.18), oklch(0.55 0.12 30 / 0.18))",
          }}
        >
          <span className="pointer-events-none absolute left-1/2 top-3 bottom-3 w-px -translate-x-1/2 bg-white/10" aria-hidden />
          <span className="pointer-events-none absolute top-1/2 left-3 right-3 h-px -translate-y-1/2 bg-white/10" aria-hidden />
          <span className="pointer-events-none absolute inset-[18%] rounded-full border border-dashed border-white/[0.07]" aria-hidden />
          <span
            ref={pointRef}
            className={cn(
              "pointer-events-none absolute left-1/2 top-1/2 size-6 rounded-full border-2 will-change-transform",
              placed ? "border-primary bg-primary shadow-[0_0_24px_4px_var(--primary)]" : "border-white/40 bg-white/10 motion-safe:animate-pulse",
            )}
            style={{ transform: pointTransform(value, size) }}
            aria-hidden
          />
        </div>
      </div>
      <p className="mt-2 min-h-5 text-sm text-muted-foreground" aria-hidden>
        {placed ? describeMood(value) : "Tap or drag to place it"}
      </p>
    </div>
  );
}
