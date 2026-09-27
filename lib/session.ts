"use client";

import { useSyncExternalStore } from "react";
import { registerSongs, songById } from "./music-context";
import type { SongPick } from "./song-layer";
import type { AnalysisResult, InferredMotivation, ListeningSignal, Song } from "./types";

export type FailureKey = "spotify" | "analysis" | "galaxy" | "card";

/** How one song feels to this person: what the backend matches on (POST /api/picks). */
export type Feeling = {
  /** Feeling tags (lib/tags.ts); older picks may carry the original ones. */
  tags: string[];
  /** -1..1, sad ↔ happy. */
  valence: number;
  /** -1..1, calm ↔ intense. */
  energy: number;
  /** False until the person has actually touched the mood circle. */
  placed: boolean;
};

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type AvatarConfig = {
  avatarUrl?: string;
  hairStyle?: "short" | "side-part" | "curly" | "long" | "bun" | "buzzed" | "spiky" | "fade" | "dreads" | "braids" | "ponytail" | "waves" | "beanie" | "cap" | "bald";
  hairColor?: string;
  skinColor?: string;
  shirtStyle?: "crewneck" | "hoodie" | "vneck" | "collared" | "tank";
  shirtColor?: string;
  facialHair?: "none" | "stubble" | "beard" | "mustache" | "goatee";
  eyewear?: "none" | "round-glasses" | "square-glasses" | "sunglasses" | "headphones" | "earrings";
  expression?: "smile" | "neutral" | "grin" | "smirk" | "tongue" | "chill";
  eyeStyle?: "normal" | "happy" | "wide" | "wink" | "starry";
  background?: string;
};

export type SessionState = {
  demo: boolean;
  failures: FailureKey[];
  source?: "spotify" | "manual";
  songs: Song[];
  signals: ListeningSignal[];
  analysis?: AnalysisResult;
  motivations: InferredMotivation[];
  revealSeen: boolean;
  /** Optional avatar configuration for profile and map */
  avatarConfig?: AvatarConfig;
  /** Optional answer to "what do you reach for when you can't decide what to play?" */
  reach?: string;
  /** Songs added from the galaxy after onboarding, with the reason typed for each. Kept out of `songs` so adding one grows the galaxy without re-laying it out. */
  picks?: SongPick[];

  /** Per conversation, the sentAt of the newest message you've seen. Drives unread dots in Messages. */
  readAt?: Record<string, string>;

  /** Onboarding "feel" step: the song ids chosen to describe (all manual picks, or up to 5 from a Spotify import). */
  describe?: string[];
  /** Onboarding "feel" step: tags + mood circle position per song id. */
  feelings?: Record<string, Feeling>;
  /** Saving described songs to the backend, which runs while the reading screen plays. */
  saveStatus?: SaveStatus;
  saveError?: string;
  /** Song ids already saved, so a retry after a partial failure never duplicates a pick. */
  savedSongIds?: string[];

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
  if (state.songs?.length) registerSongs(state.songs);
  return state;
}

export function setSession(update: Partial<SessionState> | ((s: SessionState) => Partial<SessionState>), bump = false) {
  load();
  const patch = typeof update === "function" ? update(state) : update;
  state = { ...state, ...patch, version: bump ? state.version + 1 : state.version };
  if (state.songs?.length) registerSongs(state.songs);
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
