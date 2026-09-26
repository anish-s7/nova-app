import { NextResponse } from "next/server";
import { getSpotifyAuthUrl } from "@/lib/spotify/client";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

export async function GET() {
  const profileId = await getCurrentProfileId();

  if (!profileId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const spotifyAuthUrl = getSpotifyAuthUrl(profileId);

  return NextResponse.redirect(spotifyAuthUrl);
}
