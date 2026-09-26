import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { getGalaxyMoreWindow } from "@/lib/matching/galaxyWindow";

/** "More here": the next page of people in one cluster. */
export async function GET(req: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const q = req.nextUrl.searchParams;
  const cluster = q.get("cluster");
  if (!cluster) return NextResponse.json({ error: "cluster query param is required" }, { status: 400 });
  const have = Math.max(0, Number(q.get("have")) || 0);
  const limit = Number(q.get("limit"));

  try {
    return NextResponse.json(await getGalaxyMoreWindow(profileId, cluster, have, undefined, Number.isFinite(limit) && limit > 1 ? limit : undefined));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Galaxy failed" }, { status: 500 });
  }
}
