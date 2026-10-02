"use client";

import { useSyncExternalStore } from "react";
import type { Song } from "../data/types";

/**
 * One shared audio element for song previews: starting a clip stops any other, anywhere in the app.
 * Components read the state with usePreview(); nothing about playback is stored.
 */

type State = { songId: string | null; status: "idle" | "loading" | "playing" | "error"; progress: number; currentTime: number };

let state: State = { songId: null, status: "idle", progress: 0, currentTime: 0 };
let audio: HTMLAudioElement | null = null;
let frame = 0;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

/** A fresh preview link, by search id or title + artist (preview links expire after ~15 minutes). */
export async function resolvePreviewUrl(song: Song): Promise<string | null> {
  const params = new URLSearchParams({ title: song.title, artist: song.artist });
  if (/^(deezer|itunes):\d+$/.test(song.id)) params.set("id", song.id);
  const res = await fetch(`/api/songs/preview?${params}`, { credentials: "same-origin" });
  if (!res.ok) return null;
  return ((await res.json()) as { previewUrl: string | null }).previewUrl;
}

export function stopPreview() {
  cancelAnimationFrame(frame);
  audio?.pause();
  if (audio) audio.src = "";
  audio = null;
  if (state.songId) set({ songId: null, status: "idle", progress: 0, currentTime: 0 });
}

export function stopPreviewIf(songId: string) {
  if (state.songId === songId) stopPreview();
}

async function startAudio(songId: string, url: string, startSeconds = 0, endSeconds?: number) {
  const el = new Audio(url);
  audio = el;
  el.addEventListener("ended", () => audio === el && stopPreview());
  // Preserve the direct, user-gesture play path for ordinary previews (especially iOS).
  if (startSeconds === 0 && endSeconds === undefined) {
    await el.play();
    if (audio === el) set({ songId, status: "playing", progress: 0, currentTime: 0 });
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const ready = () => resolve();
    el.addEventListener("loadedmetadata", ready, { once: true });
    el.addEventListener("error", () => reject(new Error("preview metadata failed")), { once: true });
    el.load();
  });
  if (audio !== el) return;
  const start = Math.max(0, Math.min(startSeconds, Math.max(0, el.duration - 0.05)));
  const end = Math.max(start, Math.min(endSeconds ?? el.duration, el.duration));
  el.currentTime = start;
  await el.play();
  if (audio !== el) return;
  set({ songId, status: "playing", progress: 0, currentTime: start });
  const tick = () => {
    if (audio !== el) return;
    const current = el.currentTime;
    const progress = end > start ? Math.max(0, Math.min(1, (current - start) / (end - start))) : 0;
    if (current >= end || el.ended) return stopPreview();
    set({ songId, status: "playing", progress, currentTime: current });
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

/** Play only a selected preview interval. Calling it again for the same song pauses it. */
export async function togglePreviewRange(songId: string, url: string, startSeconds: number, endSeconds: number) {
  if (state.songId === songId && state.status === "playing") return stopPreview();
  stopPreview();
  set({ songId, status: "loading", progress: 0, currentTime: startSeconds });
  try {
    await startAudio(songId, url, startSeconds, endSeconds);
  } catch (err) {
    console.error("Preview range couldn't play:", err);
    if (state.songId === songId) set({ songId, status: "error", progress: 0, currentTime: startSeconds });
  }
}

/** Play `song`'s preview, or stop it if it's the one playing. Falls back to a fresh link once. */
export async function togglePreview(song: Song) {
  if (state.songId === song.id && state.status !== "error") return stopPreview();
  stopPreview();
  set({ songId: song.id, status: "loading", progress: 0, currentTime: 0 });

  try {
    if (!song.previewUrl) throw new Error("no link from search");
    await startAudio(song.id, song.previewUrl);
  } catch {
    // The search link was missing or has expired: ask for a fresh one and try once more.
    if (state.songId !== song.id) return;
    try {
      const url = await resolvePreviewUrl(song);
      if (state.songId !== song.id) return;
      if (!url) throw new Error("no preview for this song");
      await startAudio(song.id, url);
    } catch (err) {
      console.error(`Preview for "${song.title}" couldn't play:`, err);
      if (state.songId === song.id) set({ songId: song.id, status: "error", progress: 0, currentTime: 0 });
    }
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverState: State = { songId: null, status: "idle", progress: 0, currentTime: 0 };

/** This song's preview status: "idle" | "loading" | "playing" | "error". */
export function usePreview(songId: string) {
  const s = useSyncExternalStore(subscribe, () => state, () => serverState);
  return s.songId === songId ? s.status : "idle";
}

export function usePreviewPlayback(songId: string) {
  const s = useSyncExternalStore(subscribe, () => state, () => serverState);
  return s.songId === songId ? s : serverState;
}
