import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createSessionClient, getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { upsertPortrait } from "@/lib/matching/portraits";
import { rateLimited } from "@/lib/rate-limit";

/** The signed-in user's stored listening portrait. Session client, so RLS keeps it owner-only. */
export async function GET() {
  const profileId = await getCurrentProfileId();
  if (!profileId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("profile_portraits").select("portrait, updated_at").eq("profile_id", profileId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No portrait yet" }, { status: 404 });
  return NextResponse.json({ portrait: data.portrait, updatedAt: data.updated_at });
}

/**
 * (Re)generates the signed-in user's portrait from their public picks. One Gemini call, skipped when
 * the stored portrait already covers the same picks. Called after onboarding saves and after "+".
 */
export async function POST() {
  const profileId = await getCurrentProfileId();
  if (!profileId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limited = rateLimited("portrait", profileId);
  if (limited) return limited;

  try {
    const portrait = await upsertPortrait(createServerClient(), profileId);
    if (!portrait) return NextResponse.json({ error: "No public picks yet" }, { status: 404 });
    return NextResponse.json({ portrait });
  } catch (err) {
    console.error("POST /api/portrait failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Portrait failed" }, { status: 500 });
  }
}
