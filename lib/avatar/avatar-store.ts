"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { AvatarInfo } from "./avatar";
import { REAL_DATA } from "../data/data-source";

/**
 * Everyone's profile icons, looked up by profile id as avatars render. Every UserAvatar on screen asks
 * for its person; the asks from one render are batched into a single GET /api/avatar, and answers are
 * kept for the page's lifetime (an icon someone else changes shows on the next page load). "me" is
 * the signed-in user, kept in step with their own edits via setAvatar.
 * Mock mode has no icons to fetch: everyone keeps the face generated from their name.
 */

const known = new Map<string, AvatarInfo>();
const requested = new Set<string>();
const listeners = new Set<() => void>();
let queue = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

const emit = () => listeners.forEach((l) => l());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

async function flush() {
  timer = null;
  const ids = [...queue];
  queue = new Set();
  if (!ids.length) return;
  try {
    const res = await fetch(`/api/avatar?ids=${ids.map(encodeURIComponent).join(",")}`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`GET /api/avatar ${res.status}`);
    const { avatars } = (await res.json()) as { avatars: Record<string, AvatarInfo> };
    for (const [id, info] of Object.entries(avatars)) known.set(id, info);
    emit();
  } catch (err) {
    console.error("Profile icons didn't load; showing generated faces:", err);
    for (const id of ids) requested.delete(id); // a later render may ask again
  }
}

function request(id: string) {
  if (!REAL_DATA || requested.has(id)) return;
  requested.add(id);
  queue.add(id);
  timer ??= setTimeout(flush, 30);
}

/** Someone's icon (profile id, or "me"), or undefined until it's loaded / if they haven't set one. */
export function useAvatar(id: string | undefined): AvatarInfo | undefined {
  useEffect(() => {
    if (id) request(id);
  }, [id]);
  return useSyncExternalStore(
    subscribe,
    () => (id ? known.get(id) : undefined),
    () => undefined,
  );
}

/** After I edit my icon: show it right away everywhere, under "me" and my real id. */
export function setAvatar(ids: string[], info: AvatarInfo) {
  for (const id of ids) {
    known.set(id, info);
    requested.add(id);
  }
  emit();
}

/** The current value for "me" without subscribing (the editor's starting point). */
export const getKnownAvatar = (id: string) => known.get(id);

/** Sign-in/out: icons fetched for the previous account's "me" must not carry over. */
export function forgetAvatars() {
  known.clear();
  requested.clear();
  emit();
}
