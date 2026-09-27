import { createServerClient } from "../supabase/server";
import { assessConnection } from "../gemini/assessConnection";
import { alignCardEvidence } from "./alignCardEvidence";
import { getPortraits, loadPublicPicks, upsertPortrait } from "./portraits";
import type { ConnectionCardJson } from "../supabase/types";

export interface MatchSong {
  id: string;
  title: string;
  artist: string;
  album_art_url: string | null;
}

export interface ConfirmedMatch {
  profileId: string;
  displayName: string;
  card: ConnectionCardJson;
  /** The AI's whole-profile score (0..100), which sets the order. Null on cards from before assessments. */
  score: number | null;
  /** Cosine similarity of the best pick pair, straight from match_picks (the pre-filter). */
  similarity: number;
  /** The candidate's primary cluster, if computed. */
  cluster: string | null;
  /** The candidate's public songs, for covers and overlap counts. */
  songs: MatchSong[];
}

/** New Gemini assessments per request; the rest wait for the next load. Bounds page wait and spend. */
const MAX_NEW_ASSESSMENTS = 5;
/** How many of those run at once (paid-tier key). Each takes ~2-3s, so 5 finish in ~2 rounds. */
const ASSESS_CONCURRENCY = 3;

/**
 * Pairs the AI already turned down, keyed by both pick counts so a new pick on either side earns a
 * fresh look. In-memory only (rejections aren't stored), so a restart just re-asks.
 */
const rejected = new Set<string>();

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Retrieves candidates via pgvector search over individual picks (a pre-filter only — see
 * CLAUDE.md), then has the AI assess each candidate's whole profile against the requester's
 * (lib/gemini/assessConnection.ts): both portraits and every public pick. Only confirmed matches
 * are returned, ordered by the AI's score; "insufficient evidence" candidates are dropped. Confirmed
 * matches are cached into connection_cards immediately and never regenerated.
 *
 * Requires the `match_picks` SQL function in Supabase — see db/contract.md.
 */
export async function findMatches(profileId: string, limit = 10): Promise<ConfirmedMatch[]> {
  const supabase = createServerClient();

  const { data: targetProfile, error: targetProfileError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", profileId)
    .single();

  if (targetProfileError || !targetProfile) {
    throw new Error(
      `findMatches failed to load target profile: ${targetProfileError?.message ?? "not found"}`
    );
  }

  const { data: candidates, error } = await supabase.rpc("match_picks", {
    target_profile_id: profileId,
    match_count: limit,
  });

  if (error) {
    throw new Error(`findMatches failed: ${error.message}`);
  }

  if (!candidates || candidates.length === 0) {
    return [];
  }

  // Everything the UI needs beside the card, in batched reads.
  const candidateIds = Array.from(new Set(candidates.map((c) => c.profile_id)));
  const pickIds = Array.from(new Set(candidates.flatMap((c) => [c.song_pick_id, c.target_pick_id])));
  const [{ data: clusterRows }, { data: songRows }, { data: cachedCards }, { data: hintRows }] = await Promise.all([
    supabase.from("profiles").select("id, primary_cluster").in("id", candidateIds),
    supabase.from("song_picks").select("profile_id, songs(id, title, artist, album_art_url)").in("profile_id", candidateIds).eq("is_public", true),
    supabase.from("connection_cards").select("user_a, user_b, card_json").or(`user_a.eq.${profileId},user_b.eq.${profileId}`),
    supabase.from("song_picks").select("id, songs(title)").in("id", pickIds),
  ]);
  const clusterOf = new Map((clusterRows ?? []).map((r) => [r.id, r.primary_cluster as string | null]));
  const songsOf = new Map<string, MatchSong[]>();
  for (const r of (songRows ?? []) as unknown as { profile_id: string; songs: MatchSong | null }[]) {
    if (r.songs) songsOf.set(r.profile_id, [...(songsOf.get(r.profile_id) ?? []), r.songs]);
  }
  const titleOfPick = new Map(((hintRows ?? []) as unknown as { id: string; songs: { title: string } | null }[]).map((r) => [r.id, r.songs?.title ?? null]));
  // A card that already exists is never regenerated (CLAUDE.md), so loading Connections doesn't respend Gemini calls.
  const cachedMatch = new Map<string, ConnectionCardJson>();
  for (const c of cachedCards ?? []) {
    const other = c.user_a === profileId ? c.user_b : c.user_a;
    if (c.card_json.kind !== "contrast") cachedMatch.set(other, c.card_json);
  }
  const result = (id: string, displayName: string, card: ConnectionCardJson, similarity: number): ConfirmedMatch => ({
    profileId: id,
    displayName,
    card,
    score: typeof card.score === "number" ? card.score : null,
    similarity,
    cluster: clusterOf.get(id) ?? null,
    songs: songsOf.get(id) ?? [],
  });

  const results: ConfirmedMatch[] = [];
  const toAssess = [];
  for (const candidate of candidates) {
    const cached = cachedMatch.get(candidate.profile_id);
    if (cached) results.push(result(candidate.profile_id, candidate.display_name, cached, candidate.similarity));
    else toAssess.push(candidate);
  }

  if (toAssess.length > 0) {
    // The requester's own portrait is worth one call (it's reused for every pair); candidates' are
    // used only if they already exist, so one person's load never pays for someone else's portrait.
    try {
      await upsertPortrait(supabase, profileId);
    } catch (err) {
      console.error("findMatches: couldn't refresh the requester's portrait, assessing without it:", err);
    }
    const ids = [profileId, ...toAssess.map((c) => c.profile_id)];
    const [picksOf, portraitOf] = await Promise.all([loadPublicPicks(supabase, ids), getPortraits(supabase, ids)]);
    const me = {
      displayName: targetProfile.display_name,
      portrait: portraitOf.get(profileId)?.portrait ?? null,
      picks: picksOf.get(profileId) ?? [],
    };

    // Up to MAX_NEW_ASSESSMENTS candidates that are worth asking about, assessed a few at a time.
    const batch = toAssess
      .map((candidate) => ({ candidate, theirPicks: picksOf.get(candidate.profile_id) ?? [] }))
      .filter(({ theirPicks }) => me.picks.length > 0 && theirPicks.length > 0)
      .map((c) => ({ ...c, rejectKey: `${orderedPair(profileId, c.candidate.profile_id).join(":")}:${me.picks.length}:${c.theirPicks.length}` }))
      .filter(({ rejectKey }) => !rejected.has(rejectKey))
      .slice(0, MAX_NEW_ASSESSMENTS);

    const assessOne = async ({ candidate, theirPicks, rejectKey }: (typeof batch)[number]) => {
      const songA = titleOfPick.get(candidate.target_pick_id);
      const songB = titleOfPick.get(candidate.song_pick_id);
      let assessment;
      try {
        assessment = await assessConnection(
          me,
          { displayName: candidate.display_name, portrait: portraitOf.get(candidate.profile_id)?.portrait ?? null, picks: theirPicks },
          songA && songB ? { songA, songB } : undefined
        );
      } catch (err) {
        console.error(`findMatches: assessment failed for ${candidate.profile_id}, skipping for now:`, err);
        return;
      }
      if (assessment.status !== "match") {
        rejected.add(rejectKey);
        return;
      }

      // The AI writes A-side fields for the requester; align them to the row's user_a/user_b
      // ordering before storing — see lib/matching/alignCardEvidence.ts.
      const [userA, userB] = orderedPair(profileId, candidate.profile_id);
      const alignedCard = alignCardEvidence(assessment.card, profileId, candidate.profile_id);
      const { error: upsertError } = await supabase.from("connection_cards").upsert({ user_a: userA, user_b: userB, card_json: alignedCard });
      if (upsertError) console.error(`findMatches: couldn't cache the card for ${candidate.profile_id}:`, upsertError.message);

      results.push(result(candidate.profile_id, candidate.display_name, alignedCard, candidate.similarity));
    };

    // A small worker pool: ASSESS_CONCURRENCY calls in flight, so a cold load takes ~2 rounds, not 5.
    let next = 0;
    const worker = async () => {
      while (next < batch.length) await assessOne(batch[next++]);
    };
    await Promise.all(Array.from({ length: Math.min(ASSESS_CONCURRENCY, batch.length) }, worker));
  }

  // AI score first; older cards without one fall back to the pre-filter's similarity on the same scale.
  const rank = (m: ConfirmedMatch) => m.score ?? m.similarity * 100;
  return results.sort((x, y) => rank(y) - rank(x));
}
