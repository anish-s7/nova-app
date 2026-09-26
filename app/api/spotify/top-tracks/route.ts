import { NextRequest, NextResponse } from "next/server";
import { getTopTracks, SpotifyApiError } from "@/lib/spotify/client";
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
    const status = err instanceof SpotifyApiError ? err.status : 0;
    const error =
      status === 403
        ? "This Spotify account isn't allowed on our Spotify app yet. While the app is in development mode, its owner has to add the account under User Management in the Spotify dashboard."
        : status === 401
          ? "The Spotify connection expired. Connect again."
          : status === 429
            ? "Spotify is rate-limiting us. Try again in a minute."
            : "Spotify isn't responding right now.";
    return NextResponse.json({ error }, { status: 502 });
  }
}
