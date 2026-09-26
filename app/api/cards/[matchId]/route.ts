import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { evaluateAndGenerateCard, type PickForEvaluation } from "@/lib/gemini/evaluateAndGenerateCard";
import { cosineSimilarity } from "@/lib/matching/cosineSimilarity";

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
  tags: string[];
  valence: number;
  energy: number;
  embedding: number[];
  reason_text: string | null;
  is_public: boolean;
  songs: { title: string; artist: string } | null;
};

/**
 * Direct card generation for a specific pair, used when the frontend
 * already knows it wants a card for this pair (e.g. from a cached
 * /api/match result gone stale, or a manual lookup) without going through
 * findMatches' pgvector retrieval. Picks the best-matching public pick pair
 * between the two profiles in JS (fine at hackathon scale — a handful of
 * picks per profile), then runs the same AI evidence-check everything else
 * uses. Can return "insufficient_evidence" — that's a real, non-error
 * result, not a failure.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId: otherProfileId } = await params;
  const currentProfileId = await getCurrentProfileId();

  if (!currentProfileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createServerClient();
  const picksSelect = "id, tags, valence, energy, embedding, reason_text, is_public, songs(title, artist)";

  const [{ data: profileA }, { data: profileB }, { data: picksA }, { data: picksB }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", currentProfileId).single(),
      supabase.from("profiles").select("*").eq("id", otherProfileId).single(),
      supabase.from("song_picks").select(picksSelect).eq("profile_id", currentProfileId).eq("is_public", true),
      supabase.from("song_picks").select(picksSelect).eq("profile_id", otherProfileId).eq("is_public", true),
    ]);

  if (!profileA || !profileB) {
    return NextResponse.json({ error: "One or both profiles not found" }, { status: 404 });
  }

  const rowsA = (picksA as PickRow[] | null ?? []).filter((p) => p.songs);
  const rowsB = (picksB as PickRow[] | null ?? []).filter((p) => p.songs);

  if (rowsA.length === 0 || rowsB.length === 0) {
    return NextResponse.json({ status: "insufficient_evidence", card: null });
  }

  let bestPair: { a: PickRow; b: PickRow; similarity: number } | null = null;
  for (const a of rowsA) {
    for (const b of rowsB) {
      const similarity = cosineSimilarity(a.embedding, b.embedding);
      if (!bestPair || similarity > bestPair.similarity) {
        bestPair = { a, b, similarity };
      }
    }
  }

  if (!bestPair) {
    return NextResponse.json({ status: "insufficient_evidence", card: null });
  }

  const toPickInput = (displayName: string, row: PickRow): PickForEvaluation => ({
    displayName,
    title: row.songs!.title,
    artist: row.songs!.artist,
    tags: row.tags,
    valence: row.valence,
    energy: row.energy,
    reasonText: row.reason_text,
  });

  const evaluation = await evaluateAndGenerateCard(
    toPickInput(profileA.display_name, bestPair.a),
    toPickInput(profileB.display_name, bestPair.b)
  );

  if (evaluation.status !== "match") {
    return NextResponse.json({ status: "insufficient_evidence", card: null });
  }

  const [userA, userB] = orderedPair(currentProfileId, otherProfileId);
  const { error: insertError } = await supabase
    .from("connection_cards")
    .upsert({ user_a: userA, user_b: userB, card_json: evaluation.card });

  if (insertError) {
    return NextResponse.json({ status: "match", card: evaluation.card, warning: insertError.message }, { status: 207 });
  }

  return NextResponse.json({ status: "match", card: evaluation.card, cached: false });
}
