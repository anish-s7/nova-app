import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { findMatches } from "@/lib/matching/findMatches";
import { rateLimited } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const limited = rateLimited("match", profileId);
  if (limited) return limited;

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Number(limitParam);

  try {
    const matches = await findMatches(profileId, Number.isFinite(limit) && limit > 0 ? Math.min(limit, 25) : undefined);
    return NextResponse.json({ matches });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Match query failed" },
      { status: 500 }
    );
  }
}
