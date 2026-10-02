import { NextResponse } from "next/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { findWander } from "@/lib/matching/findWander";
import { rateLimited } from "@/lib/rate-limit";

/**
 * Wander: same song, different feeling. An explicit user action (the Wander
 * button), never called on load. POST because it can generate and cache cards.
 */
export async function POST() {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const limited = rateLimited("wander", profileId);
  if (limited) return limited;

  try {
    const wanders = await findWander(profileId);
    return NextResponse.json({ wanders });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Wander failed" }, { status: 500 });
  }
}
