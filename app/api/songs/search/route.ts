import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

/**
 * Song search for picking songs and swaps: the real catalog, not the demo list. Deezer first (no
 * key, popularity-ranked, so "holocene" finds Bon Iver before covers; album art included), iTunes
 * Search if Deezer fails. Results are display candidates
 * only: the song's identity is still resolved through MusicBrainz once, when a pick is saved
 * (POST /api/picks), so this never touches MusicBrainz's 1 req/s limit. Neither source is
 * Spotify data.
 */

/** `previewUrl`: a ~30s clip for the play button. Signed and short-lived, so never stored. */
export type SearchSong = { id: string; title: string; artist: string; albumArtUrl: string | null; previewUrl: string | null };

const LIMIT = 20;
// Deezer preview links in results expire ~15 minutes after the search; stay well inside that.
const TTL_MS = 5 * 60 * 1000;
const MAX_CACHED = 500;
const cache = new Map<string, { at: number; songs: SearchSong[] }>();

async function searchITunes(q: string): Promise<SearchSong[]> {
  const url = `https://itunes.apple.com/search?${new URLSearchParams({ term: q, media: "music", entity: "song", limit: String(LIMIT) })}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`iTunes search ${res.status}`);
  const data = (await res.json()) as { results?: { trackId: number; trackName: string; artistName: string; artworkUrl100?: string; previewUrl?: string }[] };
  return (data.results ?? []).map((r) => ({
    id: `itunes:${r.trackId}`,
    title: r.trackName,
    artist: r.artistName,
    albumArtUrl: r.artworkUrl100?.replace("100x100bb", "300x300bb") ?? null,
    previewUrl: r.previewUrl ?? null,
  }));
}

async function searchDeezer(q: string): Promise<SearchSong[]> {
  const res = await fetch(`https://api.deezer.com/search?${new URLSearchParams({ q, limit: String(LIMIT) })}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Deezer search ${res.status}`);
  const data = (await res.json()) as { data?: { id: number; title: string; artist: { name: string }; album?: { cover_medium?: string }; preview?: string }[] };
  return (data.data ?? []).map((r) => ({
    id: `deezer:${r.id}`,
    title: r.title,
    artist: r.artist.name,
    albumArtUrl: r.album?.cover_medium ?? null,
    previewUrl: r.preview || null,
  }));
}

/** Same song on several albums (single, album, deluxe) shows once. */
function dedupe(songs: SearchSong[]) {
  const seen = new Set<string>();
  return songs.filter((s) => {
    const key = `${s.title}::${s.artist}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function GET(req: NextRequest) {
  if (!(await getCurrentProfileId())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ songs: [] });

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ songs: hit.songs });

  let songs: SearchSong[];
  try {
    songs = dedupe(await searchDeezer(q));
  } catch (err) {
    console.error("Deezer search failed, trying iTunes:", err);
    try {
      songs = dedupe(await searchITunes(q));
    } catch (err2) {
      console.error("iTunes search failed too:", err2);
      return NextResponse.json({ error: "Song search isn't responding right now." }, { status: 502 });
    }
  }

  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), songs });
  return NextResponse.json({ songs });
}
