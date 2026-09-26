const SPOTIFY_TRACK_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

export function isSpotifyTrackId(value: string | null | undefined): value is string {
  return typeof value === "string" && SPOTIFY_TRACK_ID_PATTERN.test(value);
}

export function spotifyTrackUrl(trackId: string | null | undefined): string | null {
  return isSpotifyTrackId(trackId) ? `https://open.spotify.com/track/${trackId}` : null;
}

export function isSpotifyTrackUrl(value: string | null | undefined): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    return (
      url.protocol === "https:" &&
      url.hostname === "open.spotify.com" &&
      parts.length === 2 &&
      parts[0] === "track" &&
      isSpotifyTrackId(parts[1])
    );
  } catch {
    return false;
  }
}
