import { NextRequest, NextResponse } from "next/server";
import { getTopTracks } from "@/lib/spotify/client";
import { SPOTIFY_TOKEN_COOKIE } from "@/lib/spotify/cookies";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

/** The signed-in user's Spotify top tracks, for display and the optional import only. */
export async function GET(req: NextRequest) {
  if (!(await getCurrentProfileId())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = req.cookies.get(SPOTIFY_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Spotify isn't connected. Connect it again to import." }, { status: 409 });
  }

  try {
    return NextResponse.json({ tracks: await getTopTracks(token) });
  } catch (err) {
    console.error("GET /api/spotify/top-tracks failed:", err);
    return NextResponse.json({ error: "Spotify isn't responding right now." }, { status: 502 });
  }
}
