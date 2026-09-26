import { NextRequest, NextResponse } from "next/server";
<<<<<<< HEAD
import {
  exchangeCodeForToken,
  getTopTracks,
  parseSpotifyOAuthState,
} from "@/lib/spotify/client";

type SpotifyStatus = "partial" | "no_history" | "error";

function pickerRedirect(
  returnOrigin: string,
  profileId: string,
  tracks: Awaited<ReturnType<typeof getTopTracks>>,
  spotifyStatus?: SpotifyStatus,
) {
  const redirectUrl = new URL("/onboarding/pick", returnOrigin);
  redirectUrl.searchParams.set("profileId", profileId);
  redirectUrl.searchParams.set("tracks", JSON.stringify(tracks));
  if (spotifyStatus) {
    redirectUrl.searchParams.set("spotifyStatus", spotifyStatus);
  }

  return NextResponse.redirect(redirectUrl);
}
=======
import { exchangeCodeForToken } from "@/lib/spotify/client";
import { SPOTIFY_STATE_COOKIE, SPOTIFY_TOKEN_COOKIE, spotifyCookieOptions, spotifyOrigin } from "@/lib/spotify/cookies";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
>>>>>>> main

/**
 * Spotify's redirect back. Verifies the one-time state, exchanges the code, and keeps the access
 * token in a short-lived httpOnly cookie; the music page then reads the tracks from
 * GET /api/spotify/top-tracks. Nothing is saved here: tags + mood are required per song and only
 * the user can provide those (the feel step).
 */
export async function GET(req: NextRequest) {
<<<<<<< HEAD
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state" },
      { status: 400 },
    );
  }

  const oauthState = parseSpotifyOAuthState(state);
  if (!oauthState) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  let topTracks: Awaited<ReturnType<typeof getTopTracks>>;
  try {
    const { access_token } = await exchangeCodeForToken(code);
    topTracks = await getTopTracks(access_token, 5);
  } catch (error) {
    console.error("[Spotify OAuth callback] import failed", {
      message: error instanceof Error ? error.message : "Unknown Spotify error",
    });
    return pickerRedirect(
      oauthState.returnOrigin,
      oauthState.profileId,
      [],
      "error",
    );
  }

  if (topTracks.length === 0) {
    console.info(
      "[Spotify OAuth callback] no usable top or recently played tracks",
    );
    return pickerRedirect(
      oauthState.returnOrigin,
      oauthState.profileId,
      [],
      "no_history",
    );
  }

  // Don't insert into user_songs here — tags + valence/energy are required
  // per song and only the user can provide those. Hand the track list to
  // the frontend so it can walk the user through picking tags + the
  // circular slider for each one, then POST each to /api/user-songs.
  return pickerRedirect(
    oauthState.returnOrigin,
    oauthState.profileId,
    topTracks,
    topTracks.length < 5 ? "partial" : undefined,
  );
=======
  // Redirect on the registered origin: req.url reads localhost in dev even when the browser is on 127.0.0.1.
  const base = spotifyOrigin() ?? req.url;
  const back = (outcome: string) => {
    const res = NextResponse.redirect(new URL(`/onboarding/music?spotify=${outcome}`, base));
    res.cookies.delete({ name: SPOTIFY_STATE_COOKIE, path: "/api/spotify" });
    return res;
  };

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back("denied"); // the user said no on Spotify's screen

  const code = params.get("code");
  const state = params.get("state");
  const expected = req.cookies.get(SPOTIFY_STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) return back("error");

  if (!(await getCurrentProfileId())) {
    return NextResponse.redirect(new URL("/login?next=/onboarding/music", base));
  }

  try {
    const { access_token, expires_in } = await exchangeCodeForToken(code);
    const res = back("connected");
    res.cookies.set(SPOTIFY_TOKEN_COOKIE, access_token, spotifyCookieOptions(Math.min(expires_in ?? 3600, 3600)));
    return res;
  } catch (err) {
    console.error("Spotify callback failed:", err);
    return back("error");
  }
>>>>>>> main
}
