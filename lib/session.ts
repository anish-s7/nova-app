"use client";

import { useSyncExternalStore } from "react";
import { songById } from "./music-context";
import type { SongPick } from "./song-layer";
import type { AnalysisResult, InferredMotivation, ListeningSignal, Song } from "./types";

export type FailureKey = "spotify" | "analysis" | "galaxy" | "card";

export type SessionState = {
  demo: boolean;
  failures: FailureKey[];
  source?: "spotify" | "manual";
  songs: Song[];
  signals: ListeningSignal[];
  analysis?: AnalysisResult;
  motivations: InferredMotivation[];
  revealSeen: boolean;
  /** Optional answer to "what do you reach for when you can't decide what to play?" */
  reach?: string;
  /** Songs added from the galaxy after onboarding, with the reason typed for each. Kept out of `songs` so adding one grows the galaxy without re-laying it out. */
  picks?: SongPick[];
  /** Per conversation, the sentAt of the newest message you've seen. Drives unread dots in Messages. */
  readAt?: Record<string, string>;
  /** Bumped whenever anything that affects the galaxy changes, used in SWR keys. */
  version: number;
};

const STORAGE_KEY = "song-galaxy-session-v2";

const initial: SessionState = {
  demo: false,
  failures: [],
  songs: [],
  signals: [],
  motivations: [],
  revealSeen: false,
  version: 0,
};

/** Fallback identity for anyone who deep-links past onboarding. */
export const PERSONA_SONGS = ["motion-sickness", "liability", "holocene", "fourth-of-july", "night-we-met", "skinny-love"];

let state: SessionState = initial;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...initial, ...(JSON.parse(raw) as SessionState) };
  } catch {
    state = initial;
  }
}

function persist() {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private mode; the in-memory state still works.
  }
}

export function getSession(): SessionState {
  load();
  return state;
}

export function setSession(update: Partial<SessionState> | ((s: SessionState) => Partial<SessionState>), bump = false) {
  load();
  const patch = typeof update === "function" ? update(state) : update;
  state = { ...state, ...patch, version: bump ? state.version + 1 : state.version };
  persist();
  listeners.forEach((l) => l());
}

export function addPick(pick: SongPick) {
  setSession((s) => ({ picks: [...(s.picks ?? []).filter((p) => p.songId !== pick.songId), pick] }));
}

export function resetSession() {
  const keep = { demo: state.demo, failures: state.failures };
  state = { ...initial, ...keep, version: state.version + 1 };
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useSession() {
  return useSyncExternalStore(subscribe, getSession, () => initial);
}

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true afterwards, so session-dependent UI doesn't flash its empty state. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function effectiveSongs(s: SessionState): Song[] {
  return s.songs.length ? s.songs : PERSONA_SONGS.map(songById);
}
