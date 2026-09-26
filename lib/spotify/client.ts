const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export function getSpotifyAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI ?? "",
    scope: "user-top-read",
    state,
    show_dialog: "true",
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string) {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI ?? "",
    }),
  });

  if (!res.ok) {
    throw new Error(`Spotify token exchange failed: ${res.status}`);
  }

  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>;
}

/** A non-2xx from the Spotify Web API, with its status so routes can explain it. */
export class SpotifyApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Display-only track data (CLAUDE.md "Spotify data can never touch the LLM"): only `name` and
 * `artist`, as plain strings, may ever reach Gemini; the art is for showing the cover.
 */
export interface SpotifyTopTrack {
  name: string;
  artist: string;
  spotifyTrackId: string;
  albumArtUrl: string | null;
}

type SpotifyTrackItem = {
  id: string;
  name: string;
  artists: { name: string }[];
  album?: { images?: { url: string; width: number | null }[] };
};

/** The user's top tracks (Spotify's default ~6-month window). Needs the `user-top-read` scope. */
export async function getTopTracks(accessToken: string, limit = 20): Promise<SpotifyTopTrack[]> {
  const res = await fetch(`${SPOTIFY_API_BASE}/me/top/tracks?limit=${limit}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new SpotifyApiError(res.status, `Spotify top tracks fetch failed: ${res.status} ${detail}`);
  }

  const data = (await res.json()) as { items?: SpotifyTrackItem[] };
  return (data.items ?? []).map((item) => {
    // Images come largest first; take the smallest one that's still at least 300px.
    const images = item.album?.images ?? [];
    const art = [...images].reverse().find((img) => (img.width ?? 0) >= 300) ?? images[0];
    return {
      name: item.name,
      artist: item.artists[0]?.name ?? "Unknown",
      spotifyTrackId: item.id,
      albumArtUrl: art?.url ?? null,
    };
  });
}
