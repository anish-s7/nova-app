import type { SupabaseClient } from "@supabase/supabase-js";
import { orderPostcards } from "../gemini/orderPostcards";
import { DEFAULT_POSTCARD_ORDER, isPostcardId, postcardById, POSTCARDS_SHOWN } from "../postcards";
import { songKey } from "../song-key";
import { isValidTag } from "../tags";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

/**
 * The song's postcard order, stored once per song in song_tags (keyed by lib/song-key.ts) as
 * [{ label: <postcard id>, why }], best fit first. Only rows made of postcard ids count; anything
 * else (the earlier word tags) is ignored.
 */
async function findOrder(supabase: Client, title: string, artist: string): Promise<string[] | null> {
  const { data, error } = await supabase.from("song_tags").select("tags").eq("song_key", songKey(title, artist)).maybeSingle();
  if (error) throw new Error(`findOrder failed: ${error.message}`);
  const ids = ((data?.tags ?? []) as { label: string }[]).map((t) => t.label);
  return ids.length && ids.every(isPostcardId) ? ids : null;
}

/**
 * Which postcards to show first for a song: stored, or ranked by Gemini once and stored for
 * everyone. Falls back to the default order (not stored) if Gemini fails.
 */
export async function ensureSongPostcards(supabase: Client, title: string, artist: string): Promise<{ order: string[]; source: "song" | "fallback" }> {
  const stored = await findOrder(supabase, title, artist);
  if (stored) return { order: stored, source: "song" };

  try {
    const { order, model } = await orderPostcards(title, artist);
    const tags = order.map((id) => ({ label: id, why: postcardById(id)!.why }));
    // Two people describing a new song at once: the first write wins, and both get the same order.
    const { error } = await supabase.from("song_tags").upsert({ song_key: songKey(title, artist), title, artist, tags, model }, { onConflict: "song_key", ignoreDuplicates: true });
    if (error) console.error("ensureSongPostcards: couldn't store the order:", error.message);
    return { order: (await findOrder(supabase, title, artist)) ?? order, source: "song" };
  } catch (err) {
    console.error(`ensureSongPostcards: default order for "${title}":`, err);
    return { order: DEFAULT_POSTCARD_ORDER.slice(0, POSTCARDS_SHOWN), source: "fallback" };
  }
}

/**
 * Checks a pick's chosen feelings: any postcard in the deck, or one of the original fixed tags
 * (older picks, demo mode). Returns each one's listening reason in order; "" marks a fixed tag,
 * which lib/cluster-assign.ts maps itself.
 */
export function resolvePickTags(tags: string[]): { tagWhys: string[] } | { invalid: string[] } {
  const invalid = tags.filter((t) => !isPostcardId(t) && !isValidTag(t));
  if (invalid.length) return { invalid };
  return { tagWhys: tags.map((t) => postcardById(t)?.why ?? "") };
}
