import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { getGalaxyWindow } from "@/lib/matching/galaxyWindow";

/** The bounded galaxy: you, your neighborhood, a few far stars, and counts for everyone else. */
export async function GET(req: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limit = Number(req.nextUrl.searchParams.get("limit"));
  try {
    return NextResponse.json(await getGalaxyWindow(profileId, Number.isFinite(limit) && limit > 1 ? limit : undefined));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Galaxy failed" }, { status: 500 });
  }
}
