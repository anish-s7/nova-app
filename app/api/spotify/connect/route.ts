import { NextRequest, NextResponse } from "next/server";
import {
  createSpotifyOAuthState,
  getSpotifyAuthUrl,
} from "@/lib/spotify/client";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

export async function GET(req: NextRequest) {
  const profileId = await getCurrentProfileId();

  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = createSpotifyOAuthState(profileId, req.nextUrl.origin);
  const spotifyAuthUrl = getSpotifyAuthUrl(state);

  return NextResponse.redirect(spotifyAuthUrl);
}
