import { NextRequest, NextResponse } from "next/server";
import { getSpotifyAuthUrl } from "@/lib/spotify/client";

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profileId");
  if (!profileId) {
    return NextResponse.json({ error: "profileId query param is required" }, { status: 400 });
  }

  // state carries the profileId through the OAuth round-trip.
  return NextResponse.redirect(getSpotifyAuthUrl(profileId));
}
