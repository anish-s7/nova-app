import { createServerClient } from "../supabase/server";
import { evaluateContrastCard } from "../gemini/evaluateContrast";
import type { PickForEvaluation } from "../gemini/evaluateAndGenerateCard";
import { alignCardEvidence } from "./alignCardEvidence";
import type { ConnectionCardJson } from "../supabase/types";

export interface WanderResult {
  profileId: string;
  displayName: string;
  card: ConnectionCardJson;
}

/** How far apart two feelings about one song have to be (distance in valence/energy space, max ~2.83) to be worth asking Gemini about. */
export const MIN_EMOTION_GAP = 0.9;

/** Candidates sent to Gemini per request. Small on purpose: Wander is an explicit tap, but each candidate is a synchronous LLM call. */
const CANDIDATE_POOL = 6;

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

type PickRow = {
  id: string;
  tags: string[];
  valence: number;
  energy: number;
  reason_text: string | null;
  songs: { title: string; artist: string } | null;
};

/**
 * Wander: people who picked the same song as you but feel it differently.
 *
 * Retrieval is the `wander_picks` RPC (same song, large valence/energy gap,
 * best gap per candidate profile, pairs that already have a card excluded).
 * Each candidate then goes through the contrast evidence-check
 * (lib/gemini/evaluateContrast.ts); "insufficient_evidence" candidates are
 * dropped, never shown. Confirmed contrast cards are cached in
 * connection_cards like any other card, so a pair is never regenerated.
 *
 * Only ever run on an explicit request from the user. Never on page load.
 */
export async function findWander(profileId: string, limit = 3): Promise<WanderResult[]> {
  const supabase = createServerClient();

  const { data: targetProfile, error: targetProfileError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", profileId)
    .single();

  if (targetProfileError || !targetProfile) {
    throw new Error(`findWander failed to load target profile: ${targetProfileError?.message ?? "not found"}`);
  }

  const { data: candidates, error } = await supabase.rpc("wander_picks", {
    target_profile_id: profileId,
    match_count: CANDIDATE_POOL,
    min_emotion_gap: MIN_EMOTION_GAP,
  });

  if (error) throw new Error(`findWander failed: ${error.message}`);
  if (!candidates || candidates.length === 0) return [];

  const pickIds = Array.from(new Set(candidates.flatMap((c) => [c.song_pick_id, c.target_pick_id])));
  const { data: picks, error: picksError } = await supabase
    .from("song_picks")
    .select("id, tags, valence, energy, reason_text, songs(title, artist)")
    .in("id", pickIds);

  if (picksError) throw new Error(`findWander failed to load picks: ${picksError.message}`);

  const pickById = new Map(((picks as unknown as PickRow[] | null) ?? []).map((p) => [p.id, p]));

  const evaluated = await Promise.all(
    candidates.map(async (candidate): Promise<WanderResult | null> => {
      const targetPickRow = pickById.get(candidate.target_pick_id);
      const candidatePickRow = pickById.get(candidate.song_pick_id);
      if (!targetPickRow?.songs || !candidatePickRow?.songs) return null;

      const toEval = (name: string, row: PickRow): PickForEvaluation => ({
        displayName: name,
        title: row.songs!.title,
        artist: row.songs!.artist,
        tags: row.tags,
        valence: row.valence,
        energy: row.energy,
        reasonText: row.reason_text,
      });

      const evaluation = await evaluateContrastCard(
        toEval(targetProfile.display_name, targetPickRow),
        toEval(candidate.display_name, candidatePickRow)
      );
      if (evaluation.status !== "contrast") return null;

      // Same perspective fix as findMatches: evidence.user_a is the requester
      // until aligned to the row's smaller-id-first ordering.
      const [userA, userB] = orderedPair(profileId, candidate.profile_id);
      const card = alignCardEvidence(evaluation.card, profileId, candidate.profile_id);

      await supabase.from("connection_cards").upsert({ user_a: userA, user_b: userB, card_json: card });

      return { profileId: candidate.profile_id, displayName: candidate.display_name, card };
    })
  );

  // Candidates arrive ordered by gap (widest first), and Promise.all keeps that order.
  return evaluated.filter((r): r is WanderResult => r !== null).slice(0, limit);
}
