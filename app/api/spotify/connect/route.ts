import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSpotifyAuthUrl } from "@/lib/spotify/client";
import { SPOTIFY_STATE_COOKIE, spotifyCookieOptions, spotifyOrigin } from "@/lib/spotify/cookies";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

/**
 * Starts the optional Spotify top-tracks import for the signed-in user. `state` is a random
 * one-time value checked by the callback (OAuth CSRF protection), never the profile id.
 */
export async function GET(req: NextRequest) {
  const origin = spotifyOrigin();
  if (!origin || !process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/onboarding/music?spotify=unconfigured", req.url));
  }

  // Cookies don't carry between localhost and 127.0.0.1: start over on the registered origin
  // (the proxy sends the user through sign-in there if needed).
  // (Next's dev server reports localhost in nextUrl whatever the browser used, so compare the Host header.)
  if (req.headers.get("host") !== new URL(origin).host) {
    return NextResponse.redirect(new URL("/onboarding/music?spotify=wrong-host", origin));
  }

  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.redirect(new URL("/login?next=/onboarding/music", origin));
  }

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(getSpotifyAuthUrl(state));
  res.cookies.set(SPOTIFY_STATE_COOKIE, state, spotifyCookieOptions(10 * 60));
  return res;
}
