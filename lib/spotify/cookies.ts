/**
 * Short-lived, httpOnly cookies for the Spotify import. Scoped to /api/spotify so no page or other
 * route ever sees them. Nothing here is stored server-side: the token only lives as long as Spotify
 * says (≤ 1h) and is only used to read the user's top tracks for display.
 */
export const SPOTIFY_STATE_COOKIE = "sg_spotify_state";
export const SPOTIFY_TOKEN_COOKIE = "sg_spotify_token";

export const spotifyCookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/spotify",
  maxAge: maxAgeSeconds,
});

/** Spotify only redirects back to the exact registered URI, so the whole round trip must start on its origin. */
export function spotifyOrigin(): string | null {
  try {
    return new URL(process.env.SPOTIFY_REDIRECT_URI ?? "").origin;
  } catch {
    return null;
  }
}
