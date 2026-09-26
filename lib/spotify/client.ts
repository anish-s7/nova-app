import { createHmac, timingSafeEqual } from "node:crypto";
import { isSpotifyTrackUrl, spotifyTrackUrl } from "./track";

const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

type SpotifyOAuthState = {
  profileId: string;
  returnOrigin: string;
};

function spotifyStateSecret() {
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!secret) throw new Error("Missing SPOTIFY_CLIENT_SECRET");
  return secret;
}

export function createSpotifyOAuthState(
  profileId: string,
  returnOrigin: string,
) {
  const payload = Buffer.from(
    JSON.stringify({ profileId, returnOrigin } satisfies SpotifyOAuthState),
  ).toString("base64url");
  const signature = createHmac("sha256", spotifyStateSecret())
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export function parseSpotifyOAuthState(
  state: string,
): SpotifyOAuthState | null {
  const [payload, signature, extra] = state.split(".");
  if (!payload || !signature || extra) return null;

  const expected = createHmac("sha256", spotifyStateSecret())
    .update(payload)
    .digest();
  const received = Buffer.from(signature, "base64url");
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("profileId" in parsed) ||
      typeof parsed.profileId !== "string" ||
      !("returnOrigin" in parsed) ||
      typeof parsed.returnOrigin !== "string"
    ) {
      return null;
    }

    const origin = new URL(parsed.returnOrigin);
    if (
      !["http:", "https:"].includes(origin.protocol) ||
      origin.origin !== parsed.returnOrigin
    ) {
      return null;
    }

    return {
      profileId: parsed.profileId,
      returnOrigin: origin.origin,
    };
  } catch {
    return null;
  }
}

export function getSpotifyAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI ?? "",
    scope: "user-top-read user-read-recently-played",
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
    console.error("[Spotify API] token exchange failed", {
      status: res.status,
      statusText: res.statusText,
      retryAfter: res.headers.get("retry-after"),
    });
    throw new Error(`Spotify token exchange failed: ${res.status}`);
  }

  return res.json() as Promise<{ access_token: string; refresh_token: string }>;
}

export interface SpotifyTopTrack {
  name: string;
  artist: string;
  spotifyTrackId: string;
  albumArtUrl: string | null;
  previewUrl: string | null;
  spotifyUrl: string | null;
}

type SpotifyTrackItem = {
  name: string;
  artists: { name: string }[];
  id: string;
  album?: { images?: { url?: string }[] };
  preview_url?: string | null;
  external_urls?: { spotify?: string };
};

type SpotifyRecentlyPlayedItem = {
  track: SpotifyTrackItem;
};

function isSpotifyTrackItem(value: unknown): value is SpotifyTrackItem {
  if (!value || typeof value !== "object") return false;

  return (
    "name" in value &&
    typeof value.name === "string" &&
    "id" in value &&
    typeof value.id === "string" &&
    "artists" in value &&
    Array.isArray(value.artists) &&
    value.artists.every(
      (artist) =>
        artist !== null &&
        typeof artist === "object" &&
        "name" in artist &&
        typeof artist.name === "string",
    ) &&
    (!("preview_url" in value) ||
      typeof value.preview_url === "string" ||
      value.preview_url === null) &&
    (!("album" in value) ||
      (value.album !== null &&
        typeof value.album === "object" &&
        (!("images" in value.album) ||
          (Array.isArray(value.album.images) &&
            value.album.images.every(
              (image) =>
                image !== null &&
                typeof image === "object" &&
                (!("url" in image) || typeof image.url === "string"),
            ))))) &&
    (!("external_urls" in value) ||
      (value.external_urls !== null &&
        typeof value.external_urls === "object" &&
        (!("spotify" in value.external_urls) ||
          typeof value.external_urls.spotify === "string")))
  );
}

function isRecentlyPlayedItem(
  value: unknown,
): value is SpotifyRecentlyPlayedItem {
  return (
    value !== null &&
    typeof value === "object" &&
    "track" in value &&
    isSpotifyTrackItem(value.track)
  );
}

function tracksFromResponse(
  data: unknown,
  itemToTrack: (item: unknown) => SpotifyTrackItem | null,
  source: "top tracks" | "recently played" | "search",
): SpotifyTopTrack[] {
  if (
    !data ||
    typeof data !== "object" ||
    !("items" in data) ||
    !Array.isArray(data.items)
  ) {
    console.error("[Spotify API] unexpected response shape", { source });
    throw new Error(`Spotify ${source} response had an unexpected shape`);
  }

  const tracks = data.items
    .map(itemToTrack)
    .filter((track): track is SpotifyTrackItem => track !== null)
    .map((track) => ({
      name: track.name,
      artist: track.artists[0]?.name ?? "Unknown",
      spotifyTrackId: track.id,
      albumArtUrl: track.album?.images?.[0]?.url ?? null,
      previewUrl: track.preview_url ?? null,
      spotifyUrl: isSpotifyTrackUrl(track.external_urls?.spotify)
        ? track.external_urls.spotify
        : spotifyTrackUrl(track.id),
    }));

  if (tracks.length !== data.items.length) {
    console.warn("[Spotify API] ignored unusable track entries", {
      source,
      ignoredCount: data.items.length - tracks.length,
    });
  }

  return tracks;
}

let clientCredentialsToken:
  | { accessToken: string; expiresAt: number }
  | undefined;

async function getClientCredentialsToken() {
  if (
    clientCredentialsToken &&
    clientCredentialsToken.expiresAt > Date.now() + 30_000
  ) {
    return clientCredentialsToken.accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Spotify app credentials are not configured");
  }

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("[Spotify Search] client credentials token failed", {
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`Spotify app authentication failed: ${response.status}`);
  }

  const token: unknown = await response.json();
  if (
    !token ||
    typeof token !== "object" ||
    !("access_token" in token) ||
    typeof token.access_token !== "string" ||
    !("expires_in" in token) ||
    typeof token.expires_in !== "number"
  ) {
    throw new Error("Spotify app authentication returned an unexpected response");
  }

  clientCredentialsToken = {
    accessToken: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  return clientCredentialsToken.accessToken;
}

export async function searchSpotifyTracks(query: string, limit = 10) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const accessToken = await getClientCredentialsToken();
  const params = new URLSearchParams({
    q: trimmedQuery,
    type: "track",
    limit: String(Math.max(1, Math.min(limit, 10))),
  });
  const response = await fetch(`${SPOTIFY_API_BASE}/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("[Spotify Search] request failed", {
      status: response.status,
      statusText: response.statusText,
      retryAfter: response.headers.get("retry-after"),
    });
    throw new Error(`Spotify search failed: ${response.status}`);
  }

  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== "object" ||
    !("tracks" in data) ||
    !data.tracks ||
    typeof data.tracks !== "object"
  ) {
    throw new Error("Spotify search returned an unexpected response");
  }

  return uniqueTracks(
    tracksFromResponse(data.tracks, (item) =>
      isSpotifyTrackItem(item) ? item : null,
    "search"),
    10,
  );
}

async function fetchSpotifyData(
  accessToken: string,
  path: string,
  source: "top tracks" | "recently played" | "search",
): Promise<unknown> {
  const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.error("[Spotify API] request failed", {
      source,
      status: res.status,
      statusText: res.statusText,
      retryAfter: res.headers.get("retry-after"),
    });
    throw new Error(`Spotify ${source} fetch failed: ${res.status}`);
  }

  return res.json() as Promise<unknown>;
}

function uniqueTracks(tracks: SpotifyTopTrack[], limit: number) {
  const seen = new Set<string>();
  const unique: SpotifyTopTrack[] = [];

  for (const track of tracks) {
    if (seen.has(track.spotifyTrackId)) continue;
    seen.add(track.spotifyTrackId);
    unique.push(track);
    if (unique.length === limit) break;
  }

  return unique;
}

function logTrackMediaAvailability(tracks: SpotifyTopTrack[]) {
  for (const track of tracks) {
    console.info("[Spotify API] imported track media", {
      name: track.name,
      hasPreviewUrl: Boolean(track.previewUrl),
      hasSpotifyUrl: Boolean(track.spotifyUrl),
    });
  }
}

export async function getTopTracks(
  accessToken: string,
  limit = 5,
): Promise<SpotifyTopTrack[]> {
  const safeLimit = Math.max(1, Math.min(limit, 5));
  const topData = await fetchSpotifyData(
    accessToken,
    `/me/top/tracks?limit=${safeLimit}`,
    "top tracks",
  );
  const topTracks = uniqueTracks(
    tracksFromResponse(
      topData,
      (item) => (isSpotifyTrackItem(item) ? item : null),
      "top tracks",
    ),
    safeLimit,
  );

  if (topTracks.length > 0) {
    logTrackMediaAvailability(topTracks);
    return topTracks;
  }

  console.info(
    "[Spotify API] top tracks was empty; falling back to recently played",
  );
  const recentData = await fetchSpotifyData(
    accessToken,
    "/me/player/recently-played?limit=50",
    "recently played",
  );
  const recentTracks = tracksFromResponse(
    recentData,
    (item) => (isRecentlyPlayedItem(item) ? item.track : null),
    "recently played",
  );

  const uniqueRecentTracks = uniqueTracks(recentTracks, safeLimit);
  logTrackMediaAvailability(uniqueRecentTracks);
  return uniqueRecentTracks;
}
