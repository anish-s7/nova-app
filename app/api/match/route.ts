import { NextRequest, NextResponse } from "next/server";
import { findMatches } from "@/lib/matching/findMatches";

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profileId");
  const limitParam = req.nextUrl.searchParams.get("limit");

  if (!profileId) {
    return NextResponse.json({ error: "profileId query param is required" }, { status: 400 });
  }

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
