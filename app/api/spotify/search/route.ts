import { NextRequest, NextResponse } from "next/server";
import { searchSpotifyTracks } from "@/lib/spotify/client";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import type { Song } from "@/lib/types";

export async function GET(request: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!query) {
    return NextResponse.json({ error: "q query param is required" }, { status: 400 });
  }

  try {
    const tracks = await searchSpotifyTracks(query, 10);
    const songs: Song[] = tracks.map((track) => ({
      id: track.spotifyTrackId,
      title: track.name,
      artist: track.artist,
      albumArtUrl: track.albumArtUrl ?? undefined,
      spotifyId: track.spotifyTrackId,
      spotifyUrl: track.spotifyUrl,
      previewUrl: track.previewUrl,
      source: "spotify",
    }));
    return NextResponse.json({ songs });
  } catch (error) {
    console.error("[Spotify Search] unavailable", {
      message: error instanceof Error ? error.message : "Unknown Spotify error",
    });
    return NextResponse.json(
      { error: "Spotify search is temporarily unavailable" },
      { status: 503 },
    );
  }
}
