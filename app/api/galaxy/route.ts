import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { getGalaxyWindow, HopNotAllowedError } from "@/lib/matching/galaxyWindow";

/** The bounded galaxy (`?center=<profileId>` hops to a star in your window and centers on them): you, your neighborhood, a few far stars, and counts for everyone else. */
export async function GET(req: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const limit = Number(req.nextUrl.searchParams.get("limit"));
  const center = req.nextUrl.searchParams.get("center") ?? undefined;
  try {
    return NextResponse.json(await getGalaxyWindow(profileId, Number.isFinite(limit) && limit > 1 ? limit : undefined, center));
  } catch (err) {
    if (err instanceof HopNotAllowedError) return NextResponse.json({ error: err.message }, { status: 403 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Galaxy failed" }, { status: 500 });
  }
}
