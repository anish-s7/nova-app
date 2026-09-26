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

  return res.json() as Promise<{ access_token: string; refresh_token: string }>;
}

export interface SpotifyTopTrack {
  name: string;
  artist: string;
  spotifyTrackId: string;
}

export async function getTopTracks(
  accessToken: string,
  limit = 5,
): Promise<SpotifyTopTrack[]> {
  const res = await fetch(`${SPOTIFY_API_BASE}/me/top/tracks?limit=${limit}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Spotify top tracks fetch failed: ${res.status}`);
  }

  const data = await res.json();
  return data.items.map(
    (item: { name: string; artists: { name: string }[]; id: string }) => ({
      name: item.name,
      artist: item.artists[0]?.name ?? "Unknown",
      spotifyTrackId: item.id,
    }),
  );
}
