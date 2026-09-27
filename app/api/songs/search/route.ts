import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

/**
 * Song search and empty-query discovery for picking songs and swaps. Search: real provider data,
 * Deezer first, then iTunes if Deezer fails or returns nothing. Discovery (empty query): the songs
 * people here pick most ("community", from our own catalog), falling back to Deezer's chart and then
 * Apple's most-played feed ("chart") while the community is too small. Results are display candidates
 * only: the song's identity is still resolved through MusicBrainz once, when a pick is saved
 * (POST /api/picks), so this never touches MusicBrainz's 1 req/s limit. Neither source is
 * Spotify data.
 */

/** `previewUrl`: a ~30s clip for the play button. Signed and short-lived, so never stored. */
export type SearchSong = { id: string; title: string; artist: string; albumArtUrl: string | null; previewUrl: string | null };

const LIMIT = 20;
const DISCOVERY_LIMIT = 10;
// Deezer preview links in results expire ~15 minutes after the search; stay well inside that.
const TTL_MS = 5 * 60 * 1000;
const MAX_CACHED = 500;
/** Community discovery needs this many songs picked by at least COMMUNITY_MIN_PICKERS people. */
const COMMUNITY_MIN_SONGS = 6;
const COMMUNITY_MIN_PICKERS = 2;
type Discovery = "community" | "chart";
const cache = new Map<string, { at: number; songs: SearchSong[]; source?: Discovery }>();

/**
 * The songs most people here have picked (public picks, one vote per person), with cover art.
 * Null while the community is too small to say. Preview links come later, per song, on demand.
 */
async function communityFavorites(): Promise<SearchSong[] | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("song_picks").select("song_id, profile_id").eq("is_public", true).limit(10000);
  if (error) throw new Error(`community favorites: ${error.message}`);
  const pickers = new Map<string, Set<string>>();
  for (const r of data ?? []) pickers.set(r.song_id, (pickers.get(r.song_id) ?? new Set()).add(r.profile_id));
  const ranked = [...pickers].filter(([, who]) => who.size >= COMMUNITY_MIN_PICKERS).sort((a, b) => b[1].size - a[1].size);
  if (ranked.length < COMMUNITY_MIN_SONGS) return null;

  const top = ranked.slice(0, DISCOVERY_LIMIT * 2).map(([id]) => id);
  const { data: songs, error: songsError } = await supabase.from("songs").select("id, title, artist, album_art_url").in("id", top);
  if (songsError) throw new Error(`community favorites songs: ${songsError.message}`);
  const byId = new Map((songs ?? []).map((row) => [row.id, row]));
  return dedupe(
    top.flatMap((id) => {
      const row = byId.get(id);
      return row ? [{ id: `catalog:${row.id}`, title: row.title, artist: row.artist, albumArtUrl: row.album_art_url, previewUrl: null }] : [];
    }),
  ).slice(0, DISCOVERY_LIMIT);
}

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

async function discoverDeezer(): Promise<SearchSong[]> {
  const res = await fetch(`https://api.deezer.com/chart/0/tracks?${new URLSearchParams({ limit: String(DISCOVERY_LIMIT) })}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Deezer discovery ${res.status}`);
  const data = (await res.json()) as { data?: { id: number; title: string; artist: { name: string }; album?: { cover_medium?: string }; preview?: string }[] };
  return (data.data ?? []).map((r) => ({
    id: `deezer:${r.id}`,
    title: r.title,
    artist: r.artist.name,
    albumArtUrl: r.album?.cover_medium ?? null,
    previewUrl: r.preview || null,
  }));
}

async function discoverITunes(): Promise<SearchSong[]> {
  const res = await fetch(`https://rss.marketingtools.apple.com/api/v2/us/music/most-played/${DISCOVERY_LIMIT}/songs.json`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`iTunes discovery ${res.status}`);
  const data = (await res.json()) as {
    feed?: { results?: { id: string; name: string; artistName: string; artworkUrl100?: string }[] };
  };
  return (data.feed?.results ?? []).map((r) => ({
    id: `itunes:${r.id}`,
    title: r.name,
    artist: r.artistName,
    albumArtUrl: r.artworkUrl100?.replace("100x100bb", "300x300bb") ?? null,
    // The chart feed has no clip URL. PreviewButton refreshes one by id or title/artist on demand.
    previewUrl: null,
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
  if (q.length === 1) return NextResponse.json({ songs: [] });

  const discovering = q.length === 0;
  const key = discovering ? "__discovery__" : q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json({ songs: hit.songs, ...(hit.source ? { source: hit.source } : {}) });

  if (discovering) {
    try {
      const favorites = await communityFavorites();
      if (favorites?.length) {
        cache.set(key, { at: Date.now(), songs: favorites, source: "community" });
        return NextResponse.json({ songs: favorites, source: "community" });
      }
    } catch (err) {
      console.error("Community favorites failed, showing the chart instead:", err);
    }
  }

  let songs: SearchSong[];
  try {
    songs = dedupe(discovering ? await discoverDeezer() : await searchDeezer(q));
    // An empty provider response is not useful discovery/search; give the fallback a chance.
    if (songs.length === 0) throw new Error(`Deezer ${discovering ? "discovery" : "search"} returned no songs`);
  } catch (err) {
    console.error(`Deezer ${discovering ? "discovery" : "search"} failed, trying iTunes:`, err);
    try {
      songs = dedupe(discovering ? await discoverITunes() : await searchITunes(q));
    } catch (err2) {
      console.error(`iTunes ${discovering ? "discovery" : "search"} failed too:`, err2);
      return NextResponse.json({ error: "Song search isn't responding right now." }, { status: 502 });
    }
  }

  if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
  const source: Discovery | undefined = discovering ? "chart" : undefined;
  cache.set(key, { at: Date.now(), songs, source });
  return NextResponse.json({ songs, ...(source ? { source } : {}) });
}
