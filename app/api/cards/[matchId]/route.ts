import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { assessConnection } from "@/lib/gemini/assessConnection";
import { getPortraits, loadPublicPicks } from "@/lib/matching/portraits";
import { cosineSimilarity } from "@/lib/matching/cosineSimilarity";
import { alignCardEvidence } from "@/lib/matching/alignCardEvidence";
import { parseVector } from "@/lib/supabase/vector";
import { rejectionKey, rememberRejection, wasRejected } from "@/lib/matching/rejectedPairs";

// matchId is the other user's profile id; the current user comes from the
// real session.
function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId: otherProfileId } = await params;
  const currentProfileId = await getCurrentProfileId();

  if (!currentProfileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [userA, userB] = orderedPair(currentProfileId, otherProfileId);
  const supabase = createServerClient();

  const { data: cached } = await supabase
    .from("connection_cards")
    .select("*")
    .eq("user_a", userA)
    .eq("user_b", userB)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({ status: "match", card: cached.card_json, cached: true });
  }

  return NextResponse.json({ status: "not_found", card: null, cached: false });
}

type PickRow = {
  id: string;
  embedding: number[];
  songs: { title: string } | null;
};

/**
 * The pair's card: the saved one if it exists (a card is never regenerated), otherwise a direct
 * assessment, so the client needs one request, not a GET miss followed by a POST. Used when the
 * frontend wants a card for this pair without going through findMatches' pgvector retrieval.
 * Pairs the AI already turned down (same pick counts) answer instantly without a Gemini call. Finds the closest public pick pair in JS
 * as a hint (fine at hackathon scale — a handful of picks per profile), then
 * runs the same whole-profile AI assessment findMatches uses. Can return
 * "insufficient_evidence" — that's a real, non-error result, not a failure.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId: otherProfileId } = await params;
  const currentProfileId = await getCurrentProfileId();

  if (!currentProfileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServerClient();
  const ids = [currentProfileId, otherProfileId];
  const [userA, userB] = orderedPair(currentProfileId, otherProfileId);

  const [{ data: saved }, { data: profiles }, { data: vectorRows }, picksOf, portraitOf] = await Promise.all([
    supabase.from("connection_cards").select("card_json").eq("user_a", userA).eq("user_b", userB).maybeSingle(),
    supabase.from("profiles").select("id, display_name").in("id", ids),
    supabase.from("song_picks").select("id, profile_id, embedding, songs(title)").in("profile_id", ids).eq("is_public", true),
    loadPublicPicks(supabase, ids),
    getPortraits(supabase, ids),
  ]);

  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  if (!nameOf.has(currentProfileId) || !nameOf.has(otherProfileId)) {
    return NextResponse.json({ error: "One or both profiles not found" }, { status: 404 });
  }

  const rows = (vectorRows ?? []) as unknown as (PickRow & { profile_id: string })[];
  const rowsA = rows.filter((p) => p.profile_id === currentProfileId && p.songs);
  const rowsB = rows.filter((p) => p.profile_id === otherProfileId && p.songs);
  const picksA = picksOf.get(currentProfileId) ?? [];
  const picksB = picksOf.get(otherProfileId) ?? [];

  if (saved) return NextResponse.json({ status: "match", card: saved.card_json, cached: true });
  if (picksA.length === 0 || picksB.length === 0) {
    return NextResponse.json({ status: "insufficient_evidence", card: null });
  }
  const rejectKey = rejectionKey(currentProfileId, otherProfileId, picksA.length, picksB.length);
  if (wasRejected(rejectKey)) return NextResponse.json({ status: "insufficient_evidence", card: null, cached: true });

  let bestPair: { a: PickRow; b: PickRow; similarity: number } | null = null;
  for (const a of rowsA) {
    for (const b of rowsB) {
      const similarity = cosineSimilarity(parseVector(a.embedding), parseVector(b.embedding));
      if (!bestPair || similarity > bestPair.similarity) {
        bestPair = { a, b, similarity };
      }
    }
  }

  const person = (id: string) => ({ displayName: nameOf.get(id)!, portrait: portraitOf.get(id)?.portrait ?? null, picks: picksOf.get(id) ?? [] });
  let evaluation;
  try {
    evaluation = await assessConnection(
      person(currentProfileId),
      person(otherProfileId),
      bestPair ? { songA: bestPair.a.songs!.title, songB: bestPair.b.songs!.title } : undefined
    );
  } catch (err) {
    console.error("POST /api/cards assessment failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Assessment failed" }, { status: 500 });
  }

  if (evaluation.status !== "match") {
    rememberRejection(rejectKey);
    return NextResponse.json({ status: "insufficient_evidence", card: null });
  }

  // Align evidence/threads to the row's ordering (smaller id first), not whichever
  // person was passed first — see lib/matching/alignCardEvidence.ts.
  const alignedCard = alignCardEvidence(evaluation.card, currentProfileId, otherProfileId);
  const { error: insertError } = await supabase
    .from("connection_cards")
    .upsert({ user_a: userA, user_b: userB, card_json: alignedCard });

  if (insertError) {
    return NextResponse.json({ status: "match", card: alignedCard, warning: insertError.message }, { status: 207 });
  }

  return NextResponse.json({ status: "match", card: alignedCard, cached: false });
}
