import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, getTopTracks } from "@/lib/spotify/client";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const profileId = req.nextUrl.searchParams.get("state");

  if (!code || !profileId) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  const { access_token } = await exchangeCodeForToken(code);
  const topTracks = await getTopTracks(access_token, 5);

  // Don't insert into user_songs here — tags + valence/energy are required
  // per song and only the user can provide those. Hand the track list to
  // the frontend so it can walk the user through picking tags + the
  // circular slider for each one, then POST each to /api/user-songs.
  const encodedTracks = encodeURIComponent(JSON.stringify(topTracks));
  return NextResponse.redirect(
    new URL(`/onboarding?profileId=${profileId}&tracks=${encodedTracks}`, req.url)
  );
}
