import { createServerClient } from "../supabase/server";
import { evaluateAndGenerateCard, type PickForEvaluation } from "../gemini/evaluateAndGenerateCard";
import { alignCardEvidence } from "./alignCardEvidence";
import type { ConnectionCardJson } from "../supabase/types";

export interface ConfirmedMatch {
  profileId: string;
  displayName: string;
  card: ConnectionCardJson;
}

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
 * Retrieves candidates via pgvector search over individual picks (not a
 * profile-level average — see CLAUDE.md), then runs each one through the
 * AI evidence-check (lib/gemini/evaluateAndGenerateCard.ts). Only
 * confirmed matches are returned; "insufficient evidence" candidates are
 * dropped here, never surfaced. Confirmed matches get cached into
 * connection_cards immediately so a later /api/cards read is free.
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

  const pickIds = Array.from(new Set(candidates.flatMap((c) => [c.song_pick_id, c.target_pick_id])));

  const { data: picks, error: picksError } = await supabase
    .from("song_picks")
    .select("id, tags, valence, energy, reason_text, songs(title, artist)")
    .in("id", pickIds);

  if (picksError) {
    throw new Error(`findMatches failed to load picks: ${picksError.message}`);
  }

  const pickById = new Map((picks as unknown as PickRow[] | null ?? []).map((p) => [p.id, p]));
  const results: ConfirmedMatch[] = [];

  for (const candidate of candidates) {
    const targetPickRow = pickById.get(candidate.target_pick_id);
    const candidatePickRow = pickById.get(candidate.song_pick_id);

    if (!targetPickRow?.songs || !candidatePickRow?.songs) continue;

    const targetPick: PickForEvaluation = {
      displayName: targetProfile.display_name,
      title: targetPickRow.songs.title,
      artist: targetPickRow.songs.artist,
      tags: targetPickRow.tags,
      valence: targetPickRow.valence,
      energy: targetPickRow.energy,
      reasonText: targetPickRow.reason_text,
    };

    const candidatePick: PickForEvaluation = {
      displayName: candidate.display_name,
      title: candidatePickRow.songs.title,
      artist: candidatePickRow.songs.artist,
      tags: candidatePickRow.tags,
      valence: candidatePickRow.valence,
      energy: candidatePickRow.energy,
      reasonText: candidatePickRow.reason_text,
    };

    const evaluation = await evaluateAndGenerateCard(targetPick, candidatePick);
    if (evaluation.status !== "match") continue;

    // evaluateAndGenerateCard always writes evidence.user_a for whichever
    // pick was passed first (the target/requester here), not whichever id
    // is smaller. Align it to the row's user_a/user_b ordering before it's
    // stored or returned, so evidence.user_a always means "the row's
    // user_a" consistently — see lib/matching/alignCardEvidence.ts.
    const [userA, userB] = orderedPair(profileId, candidate.profile_id);
    const alignedCard = alignCardEvidence(evaluation.card, profileId, candidate.profile_id);

    await supabase.from("connection_cards").upsert({
      user_a: userA,
      user_b: userB,
      card_json: alignedCard,
    });

    results.push({
      profileId: candidate.profile_id,
      displayName: candidate.display_name,
      card: alignedCard,
    });
  }

  return results;
}
