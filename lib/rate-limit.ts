import { NextResponse } from "next/server";

/**
 * A small in-memory sliding-window limiter for the routes that cost money (Gemini, MusicBrainz) or
 * can be spammed (messages). It is per server instance, so on Vercel it slows a looping client
 * down rather than stopping it exactly; the hard backstop is the Gemini quota cap in Google Cloud.
 */
type Window = { max: number; windowMs: number };

const hits = new Map<string, number[]>();

export const LIMITS = {
  pick: { max: 60, windowMs: 60 * 60_000 },
  portrait: { max: 20, windowMs: 60 * 60_000 },
  match: { max: 60, windowMs: 60 * 60_000 },
  wander: { max: 30, windowMs: 60 * 60_000 },
  card: { max: 60, windowMs: 60 * 60_000 },
  message: { max: 200, windowMs: 60 * 60_000 },
  // Everyone together, per instance: stops many throwaway accounts from adding up.
  allAi: { max: 1500, windowMs: 60 * 60_000 },
} satisfies Record<string, Window>;

function allow(key: string, { max, windowMs }: Window): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return true;
}

/** Returns a 429 response when `profileId` has used up `limit` for `name`, else null. AI routes also count against the shared cap. */
export function rateLimited(name: keyof typeof LIMITS, profileId: string, { ai = true } = {}): NextResponse | null {
  const tooMany = () => NextResponse.json({ error: "Too many requests. Please try again in a bit." }, { status: 429, headers: { "Retry-After": "300" } });
  if (!allow(`${name}:${profileId}`, LIMITS[name])) return tooMany();
  if (ai && !allow("all-ai", LIMITS.allAi)) return tooMany();
  return null;
}

/** A trimmed string no longer than `max`, or "" for anything that isn't a string. */
export function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
