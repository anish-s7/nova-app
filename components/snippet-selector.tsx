"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { resolvePreviewUrl, stopPreview, togglePreviewRange, usePreviewPlayback } from "@/lib/preview-player";
import type { Song, SongSnippet } from "@/lib/types";

const DEFAULT_SECONDS = 8;
const MIN_SECONDS = 5;
const MAX_SECONDS = 12;
const BUCKETS = 80;

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

async function durationOf(url: string, signal: AbortSignal) {
  return new Promise<number>((resolve, reject) => {
    const audio = new Audio();
    const done = () => {
      audio.src = "";
    };
    signal.addEventListener("abort", () => {
      done();
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
    audio.addEventListener("loadedmetadata", () => {
      const duration = audio.duration;
      done();
      if (Number.isFinite(duration) && duration > 0) resolve(duration);
      else reject(new Error("Invalid preview duration"));
    }, { once: true });
    audio.addEventListener("error", () => {
      done();
      reject(new Error("Preview metadata unavailable"));
    }, { once: true });
    audio.preload = "metadata";
    audio.src = url;
  });
}

async function waveformOf(url: string, signal: AbortSignal): Promise<number[]> {
  const response = await fetch(url, { mode: "cors", signal });
  if (!response.ok) throw new Error(`Preview fetch ${response.status}`);
  const bytes = await response.arrayBuffer();
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(bytes);
    const data = buffer.getChannelData(0);
    const size = Math.max(1, Math.floor(data.length / BUCKETS));
    const peaks = Array.from({ length: BUCKETS }, (_, bucket) => {
      let peak = 0;
      const end = Math.min(data.length, (bucket + 1) * size);
      for (let i = bucket * size; i < end; i += 1) peak = Math.max(peak, Math.abs(data[i]));
      return peak;
    });
    const max = Math.max(...peaks, 0.001);
    return peaks.map((peak) => peak / max);
  } finally {
    await context.close();
  }
}

export function SnippetSelector({ song, value, onChange }: { song: Song; value?: SongSnippet; onChange: (value?: SongSnippet) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<SongSnippet | undefined>(value);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ handle: "start" | "end"; left: number; width: number } | null>(null);
  const playback = usePreviewPlayback(song.id);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const fresh = await resolvePreviewUrl(song);
        if (!fresh || controller.signal.aborted) return;
        const seconds = await durationOf(fresh, controller.signal);
        if (controller.signal.aborted || seconds < MIN_SECONDS) return;
        const next = { startSeconds: 0, endSeconds: Math.min(DEFAULT_SECONDS, seconds) };
        setUrl(fresh);
        setDuration(seconds);
        setRange(next);
        onChange(next);
        waveformOf(fresh, controller.signal).then((peaks) => {
          if (!controller.signal.aborted) setWaveform(peaks);
        }).catch(() => {
          if (!controller.signal.aborted) setWaveform(null);
        });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) console.info(`No usable preview for "${song.title}".`);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      stopPreview();
    };
    // A new song must completely reset the preview asset and range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  const commit = (next: SongSnippet) => {
    setRange(next);
    onChange(next);
  };

  const moveHandle = (handle: "start" | "end", seconds: number) => {
    if (!range || !duration) return;
    let start = range.startSeconds;
    let end = range.endSeconds;
    if (handle === "start") start = Math.max(0, end - MAX_SECONDS, Math.min(seconds, end - MIN_SECONDS));
    else end = Math.min(duration, Math.max(seconds, start + MIN_SECONDS), start + MAX_SECONDS);
    commit({ ...range, startSeconds: Math.round(start * 10) / 10, endSeconds: Math.round(end * 10) / 10 });
  };

  const pointerSeconds = (clientX: number) => {
    const drag = dragRef.current;
    if (!drag) return 0;
    return Math.max(0, Math.min(duration, ((clientX - drag.left) / drag.width) * duration));
  };

  if (loading) return <div className="flex min-h-24 items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />Finding a preview…</div>;
  if (!url || !range) return <p className="py-4 text-sm text-muted-foreground">Preview unavailable for this song. You can still send it without a snippet.</p>;

  const startPct = (range.startSeconds / duration) * 100;
  const endPct = (range.endSeconds / duration) * 100;
  const isPlaying = playback.status === "playing";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void togglePreviewRange(song.id, url, range.startSeconds, range.endSeconds)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/40 text-primary hover:bg-primary/10" aria-label={isPlaying ? "Pause selected snippet" : "Play selected snippet"}>
          {playback.status === "loading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : isPlaying ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        </button>
        <p className="text-sm tabular-nums text-foreground">{formatTime(range.startSeconds)}–{formatTime(range.endSeconds)} <span className="text-muted-foreground">({(range.endSeconds - range.startSeconds).toFixed(1)}s)</span></p>
      </div>

      <div
        ref={trackRef}
        className="relative h-20 touch-none select-none overflow-hidden rounded-2xl border border-white/10 bg-card/50"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("[data-handle]")) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const center = Math.max(0, Math.min(duration, ((event.clientX - rect.left) / rect.width) * duration));
          const length = range.endSeconds - range.startSeconds;
          const start = Math.max(0, Math.min(duration - length, center - length / 2));
          commit({ ...range, startSeconds: Math.round(start * 10) / 10, endSeconds: Math.round((start + length) * 10) / 10 });
        }}
      >
        {waveform ? (
          <svg viewBox={`0 0 ${BUCKETS} 40`} preserveAspectRatio="none" className="absolute inset-0 size-full text-white/30" aria-label="Audio waveform">
            {waveform.map((peak, i) => <line key={i} x1={i + 0.5} x2={i + 0.5} y1={20 - peak * 17} y2={20 + peak * 17} stroke="currentColor" strokeWidth="0.65" />)}
          </svg>
        ) : <div className="absolute left-3 right-3 top-1/2 h-px bg-white/25" aria-label="Audio timeline" />}
        <div className="absolute inset-y-0 border-x border-primary/80 bg-primary/15" style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }} />
        {(["start", "end"] as const).map((handle) => {
          const seconds = handle === "start" ? range.startSeconds : range.endSeconds;
          const pct = handle === "start" ? startPct : endPct;
          return <button
            key={handle}
            type="button"
            data-handle={handle}
            role="slider"
            aria-label={`${handle === "start" ? "Start" : "End"} of favorite snippet`}
            aria-valuemin={handle === "start" ? 0 : range.startSeconds + MIN_SECONDS}
            aria-valuemax={handle === "start" ? range.endSeconds - MIN_SECONDS : Math.min(duration, range.startSeconds + MAX_SECONDS)}
            aria-valuenow={seconds}
            aria-valuetext={formatTime(seconds)}
            className="absolute inset-y-0 z-10 w-11 -translate-x-1/2 cursor-ew-resize touch-none focus-visible:outline-2 focus-visible:outline-primary"
            style={{ left: `${pct}%` }}
            onPointerDown={(event) => {
              const rect = trackRef.current?.getBoundingClientRect();
              if (!rect) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { handle, left: rect.left, width: rect.width };
            }}
            onPointerMove={(event) => {
              if (!dragRef.current || dragRef.current.handle !== handle) return;
              moveHandle(handle, pointerSeconds(event.clientX));
            }}
            onPointerUp={() => { dragRef.current = null; }}
            onPointerCancel={() => { dragRef.current = null; }}
            onKeyDown={(event) => {
              const delta = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -0.5 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 0.5 : 0;
              if (!delta) return;
              event.preventDefault();
              moveHandle(handle, seconds + delta);
            }}
          ><span className="absolute left-1/2 top-1/2 h-10 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_12px_color-mix(in_oklch,var(--primary)_60%,transparent)]" /></button>;
        })}
        {isPlaying ? <div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-white" style={{ left: `${startPct + (endPct - startPct) * playback.progress}%` }} /> : null}
      </div>
      <label className="block text-xs text-muted-foreground">Optional label
        <input value={range.label ?? ""} maxLength={80} onChange={(event) => commit({ ...range, label: event.target.value || undefined })} placeholder="This is my favorite part" className="mt-1.5 h-10 w-full rounded-full border border-white/10 bg-card/50 px-4 text-sm text-foreground outline-none transition-colors focus:border-primary/50" />
      </label>
    </div>
  );
}
