import { NextRequest, NextResponse } from "next/server";
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

export async function GET(req: NextRequest) {
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
}
