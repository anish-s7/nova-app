import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { findMatches } from "@/lib/matching/findMatches";

export async function GET(req: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const limitParam = req.nextUrl.searchParams.get("limit");

  try {
    const matches = await findMatches(profileId, limitParam ? Number(limitParam) : undefined);
    return NextResponse.json({ matches });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Match query failed" },
      { status: 500 }
    );
  }
}
