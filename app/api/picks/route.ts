import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { generateSongContext } from "@/lib/gemini/generateSongContext";
import { findCover } from "@/lib/cover-art";
import { resolveSong } from "@/lib/musicbrainz/client";
import { EMOTION_WEIGHT, clampEmotionValue } from "@/lib/emotion";
import { isValidTag } from "@/lib/tags";
import { refreshPrimaryCluster } from "@/lib/matching/refreshPrimaryCluster";
import { parseVector } from "@/lib/supabase/vector";

function fallbackKey(title: string, artist: string) {
  return `${title.trim().toLowerCase()}::${artist.trim().toLowerCase()}`;
}

export async function POST(req: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const {
    title,
    artist,
    spotifyTrackId,
    albumArtUrl,
    tags,
    valence,
    energy,
    reasonText,
    isPublic,
  } = body as {
    title?: string;
    artist?: string;
    spotifyTrackId?: string | null;
    albumArtUrl?: string | null;
    tags?: string[];
    valence?: number;
    energy?: number;
    reasonText?: string;
    isPublic?: boolean;
  };

  if (!title || !artist || !Array.isArray(tags) || tags.length === 0) {
    return NextResponse.json(
      { error: "title, artist, and at least one tag are required" },
      { status: 400 }
    );
  }

  const invalidTags = tags.filter((t) => !isValidTag(t));
  if (invalidTags.length > 0) {
    return NextResponse.json(
      { error: `Invalid tags: ${invalidTags.join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Song identity: MusicBrainz first, Gemini only as a fallback when it
  // can't confidently resolve the typed title/artist. See CLAUDE.md.
  let resolution: Awaited<ReturnType<typeof resolveSong>> = null;
  try {
    resolution = await resolveSong(title, artist);
  } catch {
    // MusicBrainz being down/unreachable shouldn't block a pick — fall
    // through to the Gemini fallback path below.
    resolution = null;
  }

  const canonicalTitle = resolution?.title ?? title;
  const canonicalArtist = resolution?.artist ?? artist;

  // Look up the shared catalog song first — avoid a duplicate Gemini call
  // for a song another user already added.
  const existingSongQuery = resolution
    ? supabase.from("songs").select("*").eq("mbid", resolution.mbid).maybeSingle()
    : supabase.from("songs").select("*").eq("fallback_key", fallbackKey(title, artist)).maybeSingle();

  const { data: existingSong } = await existingSongQuery;
  let song = existingSong;

  if (!song) {
    // COMPLIANCE: only title/artist strings go to Gemini, never Spotify's
    // API response or anything MusicBrainz-derived beyond the plain name.
    const { contextSummary, embedding } = await generateSongContext(canonicalTitle, canonicalArtist);
    const coverArt = albumArtUrl ?? (await findCover(canonicalTitle, canonicalArtist, resolution?.releaseIds));

    const { data: inserted, error: insertError } = await supabase
      .from("songs")
      .insert({
        title: canonicalTitle,
        artist: canonicalArtist,
        mbid: resolution?.mbid ?? null,
        fallback_key: resolution ? null : fallbackKey(title, artist),
        resolution_source: resolution ? "musicbrainz" : "gemini_fallback",
        spotify_track_id: spotifyTrackId ?? null,
        album_art_url: coverArt,
        context_summary: contextSummary,
        embedding,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    song = inserted;
  }

  if (!song.embedding) {
    return NextResponse.json({ error: "Catalog song is missing an embedding" }, { status: 500 });
  }

  const clampedValence = clampEmotionValue(valence ?? 0);
  const clampedEnergy = clampEmotionValue(energy ?? 0);
  const pickEmbedding = [
    ...parseVector(song.embedding),
    clampedValence * EMOTION_WEIGHT,
    clampedEnergy * EMOTION_WEIGHT,
  ];

  const { data: pick, error: pickError } = await supabase
    .from("song_picks")
    .insert({
      profile_id: profileId,
      song_id: song.id,
      tags,
      valence: clampedValence,
      energy: clampedEnergy,
      embedding: pickEmbedding,
      reason_text: reasonText ?? null,
      is_public: isPublic ?? true,
    })
    .select()
    .single();

  if (pickError) {
    return NextResponse.json({ error: pickError.message }, { status: 500 });
  }

  // Keep the galaxy label current. A failure here must not fail the pick, which is already saved:
  // the next pick, or the next galaxy load, recomputes it.
  // Service-role client: primary_cluster is a derived label the backend writes, and the
  // `authenticated` role can only update profiles.display_name.
  try {
    await refreshPrimaryCluster(supabase, profileId);
  } catch (err) {
    console.error("refreshPrimaryCluster failed after pick insert:", err);
  }

  return NextResponse.json({ song, pick });
}
