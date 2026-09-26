/**
 * Recomputes every song_picks.embedding with the current formula (buildPickEmbedding in
 * lib/matching/pickEmbedding.ts). Run after changing EMOTION_WEIGHT or the formula itself:
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/recompute-pick-embeddings.ts
 *
 * Needs migration 20260927020000 (service role may update song_picks.embedding). Safe to re-run:
 * it only rewrites the vector from each pick's own song embedding, valence and energy.
 */
import { createServerClient } from "../lib/supabase/server";
import { parseVector } from "../lib/supabase/vector";
import { buildPickEmbedding } from "../lib/matching/pickEmbedding";

const PAGE = 500;

async function main() {
  const supabase = createServerClient();

  const picks: { id: string; song_id: string; valence: number; energy: number }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("song_picks")
      .select("id, song_id, valence, energy")
      .order("created_at")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to load picks: ${error.message}`);
    picks.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const songIds = [...new Set(picks.map((p) => p.song_id))];
  const songEmbedding = new Map<string, number[]>();
  for (let i = 0; i < songIds.length; i += PAGE) {
    const { data, error } = await supabase.from("songs").select("id, embedding").in("id", songIds.slice(i, i + PAGE));
    if (error) throw new Error(`Failed to load songs: ${error.message}`);
    for (const s of data ?? []) if (s.embedding) songEmbedding.set(s.id, parseVector(s.embedding));
  }

  let updated = 0;
  let skipped = 0;
  for (const pick of picks) {
    const song = songEmbedding.get(pick.song_id);
    if (!song) {
      console.warn(`  skipped pick ${pick.id}: its song has no embedding`);
      skipped++;
      continue;
    }
    const { error } = await supabase
      .from("song_picks")
      .update({ embedding: buildPickEmbedding(song, pick.valence, pick.energy) })
      .eq("id", pick.id);
    if (error) throw new Error(`Failed to update pick ${pick.id}: ${error.message}`);
    updated++;
  }

  console.log(`Recomputed ${updated} pick embeddings${skipped ? `, skipped ${skipped}` : ""}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
