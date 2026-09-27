import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

/**
 * A fresh ~30s preview clip for one song. Deezer's preview links expire after ~15 minutes, so the
 * play button asks here when a link from search has gone stale, and saved songs (which never store
 * a link) can ask by title + artist.
 *
 *   ?id=deezer:<id> | itunes:<id>     a search result
 *   ?title=…&artist=…                 any song (best Deezer match, then iTunes)
 */

async function deezerTrack(id: string): Promise<string | null> {
  const res = await fetch(`https://api.deezer.com/track/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { preview?: string; error?: unknown };
  return data.error ? null : data.preview || null;
}

async function itunesTrack(id: string): Promise<string | null> {
  const res = await fetch(`https://itunes.apple.com/lookup?${new URLSearchParams({ id })}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: { previewUrl?: string }[] };
  return data.results?.[0]?.previewUrl ?? null;
}

async function byTitleArtist(title: string, artist: string): Promise<string | null> {
  const q = `artist:"${artist.replace(/"/g, "")}" track:"${title.replace(/"/g, "")}"`;
  const res = await fetch(`https://api.deezer.com/search?${new URLSearchParams({ q, limit: "1" })}`, { signal: AbortSignal.timeout(5000) });
  if (res.ok) {
    const data = (await res.json()) as { data?: { preview?: string }[] };
    const hit = data.data?.[0]?.preview;
    if (hit) return hit;
  }
  const it = await fetch(`https://itunes.apple.com/search?${new URLSearchParams({ term: `${title} ${artist}`, media: "music", entity: "song", limit: "1" })}`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!it.ok) return null;
  const data = (await it.json()) as { results?: { previewUrl?: string }[] };
  return data.results?.[0]?.previewUrl ?? null;
}

export async function GET(req: NextRequest) {
  if (!(await getCurrentProfileId())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const id = params.get("id") ?? "";
  const title = (params.get("title") ?? "").trim().slice(0, 200);
  const artist = (params.get("artist") ?? "").trim().slice(0, 200);

  try {
    let previewUrl: string | null = null;
    const [source, sourceId] = id.split(":");
    if (source === "deezer" && /^\d+$/.test(sourceId ?? "")) previewUrl = await deezerTrack(sourceId);
    else if (source === "itunes" && /^\d+$/.test(sourceId ?? "")) previewUrl = await itunesTrack(sourceId);
    if (!previewUrl && title && artist) previewUrl = await byTitleArtist(title, artist);
    if (!previewUrl && !(title && artist) && !id) return NextResponse.json({ error: "Pass id, or title and artist" }, { status: 400 });
    return NextResponse.json({ previewUrl });
  } catch (err) {
    console.error("GET /api/songs/preview failed:", err);
    return NextResponse.json({ error: "Previews aren't responding right now." }, { status: 502 });
  }
}
