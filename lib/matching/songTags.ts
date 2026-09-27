import type { SupabaseClient } from "@supabase/supabase-js";
import { LEGACY_SONG_TAGS } from "../cluster-assign";
import { generateSongTags } from "../gemini/generateSongTags";
import { songKey } from "../song-key";
import { isValidTag, type SongTag } from "../tags";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

/** A song's stored tags, if it has any. Service-role client. */
export async function findSongTags(supabase: Client, title: string, artist: string): Promise<SongTag[] | null> {
  const { data, error } = await supabase.from("song_tags").select("tags").eq("song_key", songKey(title, artist)).maybeSingle();
  if (error) throw new Error(`findSongTags failed: ${error.message}`);
  return (data?.tags as SongTag[] | undefined) ?? null;
}

/**
 * A song's tags: stored ones, or written by Gemini once and stored for everyone. If Gemini fails,
 * falls back to the fixed tags (not stored, so the next request tries again).
 */
export async function ensureSongTags(supabase: Client, title: string, artist: string): Promise<{ tags: SongTag[]; source: "song" | "fallback" }> {
  const stored = await findSongTags(supabase, title, artist);
  if (stored?.length) return { tags: stored, source: "song" };

  try {
    const { tags, model } = await generateSongTags(title, artist);
    // Two people describing a new song at once: the first write wins, and both get the same tags.
    const { error } = await supabase.from("song_tags").upsert({ song_key: songKey(title, artist), title, artist, tags, model }, { onConflict: "song_key", ignoreDuplicates: true });
    if (error) console.error("ensureSongTags: couldn't store tags:", error.message);
    const winner = await findSongTags(supabase, title, artist);
    return { tags: winner?.length ? winner : tags, source: "song" };
  } catch (err) {
    console.error(`ensureSongTags: falling back to the fixed tags for "${title}":`, err);
    return { tags: LEGACY_SONG_TAGS, source: "fallback" };
  }
}

/**
 * Checks a pick's chosen tags against the song's own tags (or the original fixed ones, always
 * allowed) and returns the listening reason per tag, in order. "" marks a fixed tag, which
 * lib/cluster-assign.ts maps itself. Any other tag is an error.
 */
export async function resolvePickTags(
  supabase: Client,
  names: { title: string; artist: string }[],
  tags: string[],
): Promise<{ tagWhys: string[] } | { invalid: string[] }> {
  let songTags: SongTag[] = [];
  for (const n of names) {
    const found = await findSongTags(supabase, n.title, n.artist);
    if (found?.length) {
      songTags = found;
      break;
    }
  }
  const whyOf = new Map(songTags.map((t) => [t.label, t.why]));
  const invalid = tags.filter((t) => !whyOf.has(t) && !isValidTag(t));
  if (invalid.length) return { invalid };
  return { tagWhys: tags.map((t) => (isValidTag(t) ? "" : whyOf.get(t)!)) };
}
