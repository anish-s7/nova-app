import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/spotify/client";
import { SPOTIFY_STATE_COOKIE, SPOTIFY_TOKEN_COOKIE, spotifyCookieOptions, spotifyOrigin } from "@/lib/spotify/cookies";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

/**
 * Spotify's redirect back. Verifies the one-time state, exchanges the code, and keeps the access
 * token in a short-lived httpOnly cookie; the music page then reads the tracks from
 * GET /api/spotify/top-tracks. Nothing is saved here: tags + mood are required per song and only
 * the user can provide those (the feel step).
 */
export async function GET(req: NextRequest) {
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
}
