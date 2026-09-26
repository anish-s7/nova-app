import { NextResponse } from "next/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { getGalaxySongs } from "@/lib/matching/galaxySongs";

/** The song layer for your galaxy window: songs people picked, who has them, and why. */
export async function GET() {
  const profileId = await getCurrentProfileId();
  if (!profileId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    return NextResponse.json(await getGalaxySongs(profileId));
  } catch (err) {
    console.error("GET /api/galaxy/songs failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Songs failed" }, { status: 500 });
  }
}
