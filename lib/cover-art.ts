import { findCoverArtUrl as findArchiveCover } from "@/lib/musicbrainz/client";

// Display-only image lookups. Nothing here goes to Gemini, so the Spotify
// rule in CLAUDE.md is unaffected; we store just the URL and hotlink it.

const TIMEOUT_MS = 8000;

/** Lowercase, accents/parentheticals/punctuation stripped, for loose title/artist comparison. */
function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameSong(title: string, artist: string, candTitle: string, candArtist: string) {
  const t = norm(title), a = norm(artist), ct = norm(candTitle), ca = norm(candArtist);
  if (!t || !a || t !== ct) return false;
  return ca.includes(a) || a.includes(ca);
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.error("Cover art lookup failed", url, err);
    return null;
  }
}

async function itunesCover(title: string, artist: string): Promise<string | null> {
  const data = await getJson<{ results?: { trackName?: string; artistName?: string; artworkUrl100?: string }[] }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(`${title} ${artist}`)}&entity=song&limit=8`,
  );
  const hit = data?.results?.find(
    (r) => r.artworkUrl100 && sameSong(title, artist, r.trackName ?? "", r.artistName ?? ""),
  );
  return hit?.artworkUrl100?.replace("100x100bb", "300x300bb") ?? null;
}

async function deezerCover(title: string, artist: string): Promise<string | null> {
  const q = `artist:"${artist.replace(/"/g, "")}" track:"${title.replace(/"/g, "")}"`;
  const data = await getJson<{ data?: { title?: string; artist?: { name?: string }; album?: { cover_big?: string } }[] }>(
    `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=8`,
  );
  const hit = data?.data?.find(
    (r) => r.album?.cover_big && sameSong(title, artist, r.title ?? "", r.artist?.name ?? ""),
  );
  return hit?.album?.cover_big ?? null;
}

/**
 * Best-effort cover for a song: Cover Art Archive (exact, via MusicBrainz
 * releases), then iTunes, then Deezer. The last two are text searches, so a
 * result is only accepted when its title and artist match ours. Null means
 * the UI shows its generated sleeve.
 */
export async function findCover(title: string, artist: string, releaseIds: string[] = []): Promise<string | null> {
  return (
    (releaseIds.length ? await findArchiveCover(releaseIds) : null) ??
    (await itunesCover(title, artist)) ??
    (await deezerCover(title, artist))
  );
}
