import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, getTopTracks } from "@/lib/spotify/client";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const profileId = req.nextUrl.searchParams.get("state");

  if (!code || !profileId) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  const { access_token } = await exchangeCodeForToken(code);
  const topTracks = await getTopTracks(access_token, 5);

  // Insert bare song rows only — reason_text is left empty for the user to
  // fill in manually, since Spotify can't tell us *why* a song matters.
  const supabase = createServerClient();
  const { error } = await supabase.from("songs").insert(
    topTracks.map((t) => ({
      profile_id: profileId,
      title: t.name,
      artist: t.artist,
      spotify_track_id: t.spotifyTrackId,
      reason_text: "",
    }))
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/", req.url));
}
