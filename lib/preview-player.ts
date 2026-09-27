"use client";

import { useSyncExternalStore } from "react";
import type { Song } from "./types";

/**
 * One shared audio element for song previews: starting a clip stops any other, anywhere in the app.
 * Components read the state with usePreview(); nothing about playback is stored.
 */

type State = { songId: string | null; status: "idle" | "loading" | "playing" | "error" };

let state: State = { songId: null, status: "idle" };
let audio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

/** A fresh preview link, by search id or title + artist (preview links expire after ~15 minutes). */
async function freshPreviewUrl(song: Song): Promise<string | null> {
  const params = new URLSearchParams({ title: song.title, artist: song.artist });
  if (/^(deezer|itunes):\d+$/.test(song.id)) params.set("id", song.id);
  const res = await fetch(`/api/songs/preview?${params}`, { credentials: "same-origin" });
  if (!res.ok) return null;
  return ((await res.json()) as { previewUrl: string | null }).previewUrl;
}

export function stopPreview() {
  audio?.pause();
  audio = null;
  if (state.songId) set({ songId: null, status: "idle" });
}

/** Play `song`'s preview, or stop it if it's the one playing. Falls back to a fresh link once. */
export async function togglePreview(song: Song) {
  if (state.songId === song.id && state.status !== "error") return stopPreview();
  stopPreview();
  set({ songId: song.id, status: "loading" });

  const start = async (url: string) => {
    const el = new Audio(url);
    audio = el;
    el.addEventListener("ended", () => audio === el && stopPreview());
    await el.play();
    if (audio === el) set({ songId: song.id, status: "playing" });
  };

  try {
    if (!song.previewUrl) throw new Error("no link from search");
    await start(song.previewUrl);
  } catch {
    // The search link was missing or has expired: ask for a fresh one and try once more.
    if (state.songId !== song.id) return;
    try {
      const url = await freshPreviewUrl(song);
      if (state.songId !== song.id) return;
      if (!url) throw new Error("no preview for this song");
      await start(url);
    } catch (err) {
      console.error(`Preview for "${song.title}" couldn't play:`, err);
      if (state.songId === song.id) set({ songId: song.id, status: "error" });
    }
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverState: State = { songId: null, status: "idle" };

/** This song's preview status: "idle" | "loading" | "playing" | "error". */
export function usePreview(songId: string) {
  const s = useSyncExternalStore(subscribe, () => state, () => serverState);
  return s.songId === songId ? s.status : "idle";
}
