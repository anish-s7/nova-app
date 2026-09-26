import type { SupabaseClient } from "@supabase/supabase-js";
import { generatePortrait, type PortraitPick } from "../gemini/generatePortrait";
import type { Portrait } from "../portrait";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

type PickRow = {
  profile_id: string;
  tags: string[];
  valence: number;
  energy: number;
  reason_text: string | null;
  songs: { title: string; artist: string; context_summary: string | null } | null;
};

/** Public picks per profile, shaped for Gemini (plain strings only). Service-role client. */
export async function loadPublicPicks(supabase: Client, profileIds: string[]): Promise<Map<string, PortraitPick[]>> {
  const out = new Map<string, PortraitPick[]>();
  if (profileIds.length === 0) return out;
  const { data, error } = await supabase
    .from("song_picks")
    .select("profile_id, tags, valence, energy, reason_text, songs(title, artist, context_summary)")
    .in("profile_id", profileIds)
    .eq("is_public", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`loadPublicPicks failed: ${error.message}`);

  for (const r of (data ?? []) as unknown as PickRow[]) {
    if (!r.songs) continue;
    const pick: PortraitPick = {
      title: r.songs.title,
      artist: r.songs.artist,
      contextSummary: r.songs.context_summary,
      tags: r.tags,
      valence: r.valence,
      energy: r.energy,
      reasonText: r.reason_text,
    };
    out.set(r.profile_id, [...(out.get(r.profile_id) ?? []), pick]);
  }
  return out;
}

/** Stored portraits for these profiles (missing ones are simply absent). Service-role client. */
export async function getPortraits(
  supabase: Client,
  profileIds: string[],
): Promise<Map<string, { portrait: Portrait; pickCount: number; picksUpdatedAt: string | null }>> {
  const out = new Map<string, { portrait: Portrait; pickCount: number; picksUpdatedAt: string | null }>();
  if (profileIds.length === 0) return out;
  const { data, error } = await supabase.from("profile_portraits").select("profile_id, portrait, pick_count, picks_updated_at").in("profile_id", profileIds);
  if (error) throw new Error(`getPortraits failed: ${error.message}`);
  for (const r of data ?? []) out.set(r.profile_id, { portrait: r.portrait, pickCount: r.pick_count, picksUpdatedAt: r.picks_updated_at });
  return out;
}

/** When this profile's public picks last changed (newest updated_at), or null with no public picks. */
async function newestPickChange(supabase: Client, profileId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("song_picks")
    .select("updated_at")
    .eq("profile_id", profileId)
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`newestPickChange failed: ${error.message}`);
  return data?.updated_at ?? null;
}

/**
 * Regenerates one profile's portrait from their public picks and stores it. Skips the Gemini call
 * when the stored portrait already covers the same picks (same count and no pick edited or added
 * since), unless `force`. Returns null
 * when the profile has no public picks yet. Service-role client (the table has no user write grant).
 */
export async function upsertPortrait(supabase: Client, profileId: string, { force = false } = {}): Promise<Portrait | null> {
  const picks = (await loadPublicPicks(supabase, [profileId])).get(profileId) ?? [];
  if (picks.length === 0) return null;

  const picksUpdatedAt = await newestPickChange(supabase, profileId);
  if (!force) {
    const existing = (await getPortraits(supabase, [profileId])).get(profileId);
    // Count alone misses edits and swaps (same number of picks), so also compare the newest change.
    if (existing && existing.pickCount === picks.length && existing.picksUpdatedAt === picksUpdatedAt) return existing.portrait;
  }

  const { portrait, model } = await generatePortrait(picks);
  const { error } = await supabase.from("profile_portraits").upsert({
    profile_id: profileId,
    portrait,
    pick_count: picks.length,
    picks_updated_at: picksUpdatedAt,
    model,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`upsertPortrait failed to write: ${error.message}`);
  return portrait;
}
