import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  generateConnectionCard,
  type ProfileForCard,
} from "@/lib/gemini/generateCard";

// matchId is the other user's profile id; the current user's id is passed
// as a query param since we don't have session auth wired up yet.
function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId: otherProfileId } = await params;
  const currentProfileId = req.nextUrl.searchParams.get("profileId");

  if (!currentProfileId) {
    return NextResponse.json(
      { error: "profileId query param is required" },
      { status: 400 },
    );
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
    return NextResponse.json({ card: cached.card_json, cached: true });
  }

  return NextResponse.json({ card: null, cached: false });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId: otherProfileId } = await params;
  const body = await req.json();
  const currentProfileId = body.profileId as string | undefined;

  if (!currentProfileId) {
    return NextResponse.json(
      { error: "profileId is required in the request body" },
      { status: 400 },
    );
  }

  const supabase = createServerClient();

  const [{ data: profileA }, { data: profileB }] = await Promise.all([
    supabase
      .from("profiles")
      .select("*, songs(*)")
      .eq("id", currentProfileId)
      .single(),
    supabase
      .from("profiles")
      .select("*, songs(*)")
      .eq("id", otherProfileId)
      .single(),
  ]);

  if (!profileA || !profileB) {
    return NextResponse.json(
      { error: "One or both profiles not found" },
      { status: 404 },
    );
  }

  const toCardInput = (p: typeof profileA): ProfileForCard => ({
    displayName: p.display_name,
    songs: (
      p as unknown as {
        songs: {
          title: string;
          artist: string;
          reason_text: string;
          is_public: boolean;
        }[];
      }
    ).songs
      .filter((s) => s.is_public)
      .map((s) => ({
        title: s.title,
        artist: s.artist,
        reasonText: s.reason_text,
      })),
  });

  const card = await generateConnectionCard(
    toCardInput(profileA),
    toCardInput(profileB),
  );

  const [userA, userB] = orderedPair(currentProfileId, otherProfileId);
  const { error: insertError } = await supabase
    .from("connection_cards")
    .upsert(
      { user_a: userA, user_b: userB, card_json: card },
      { onConflict: "user_a,user_b" },
    );

  if (insertError) {
    return NextResponse.json(
      { card, warning: insertError.message },
      { status: 207 },
    );
  }

  return NextResponse.json({ card, cached: false });
}
