import { after, NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { generateSongContext } from "@/lib/gemini/generateSongContext";
import { findCover } from "@/lib/music/cover-art";
import { resolveSong } from "@/lib/musicbrainz/client";
import { clampEmotionValue } from "@/lib/music/emotion";
import { buildPickEmbedding } from "@/lib/matching/pickEmbedding";
import { isValidTag } from "@/lib/music/tags";
import { refreshPrimaryCluster } from "@/lib/matching/refreshPrimaryCluster";
import { forgetGalaxyCandidates } from "@/lib/matching/galaxyWindow";
import { parseVector } from "@/lib/supabase/vector";

function fallbackKey(title: string, artist: string) {
  return `${title.trim().toLowerCase()}::${artist.trim().toLowerCase()}`;
}

/**
 * After any pick change: drops this profile's shared galaxy pool now, so their next galaxy load
 * sees the change, and keeps the galaxy label current once the response is sent: the pick is already saved, so the
 * caller shouldn't wait on it, and a failure here must not fail the pick (the next pick, or the
 * next galaxy load, recomputes it). Service-role client: primary_cluster is a derived label the
 * backend writes, and the `authenticated` role can only update profiles.display_name.
 */
function refreshClusterAfterResponse(supabase: ReturnType<typeof createServerClient>, profileId: string, change: string) {
  forgetGalaxyCandidates(profileId);
  after(async () => {
    try {
      await refreshPrimaryCluster(supabase, profileId);
    } catch (err) {
      console.error(`refreshPrimaryCluster failed after pick ${change}:`, err);
    }
    forgetGalaxyCandidates(profileId); // a galaxy load during the refresh may have cached the old label
  });
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
  } catch (err) {
    // MusicBrainz being down/unreachable shouldn't block a pick — fall
    // through to the Gemini fallback path below.
    console.error("MusicBrainz resolve failed, using the Gemini fallback:", err);
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
    // The client's art is only trusted when it's Spotify's CDN (the import). Anything else, like the
    // mock catalog's local /covers/*.png paths, would be stored as a broken URL and skip the lookup.
    const trustedArt = albumArtUrl && /^https:\/\/i\.scdn\.co\//.test(albumArtUrl) ? albumArtUrl : null;
    // Independent lookups, so they run side by side instead of Gemini then cover art.
    // COMPLIANCE: only title/artist strings go to Gemini, never Spotify's
    // API response or anything MusicBrainz-derived beyond the plain name.
    const [{ contextSummary, embedding }, coverArt] = await Promise.all([
      generateSongContext(canonicalTitle, canonicalArtist),
      trustedArt ?? findCover(canonicalTitle, canonicalArtist, resolution?.releaseIds),
    ]);

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
  const pickEmbedding = buildPickEmbedding(parseVector(song.embedding), clampedValence, clampedEnergy);

  // One pick per (profile, song): re-picking a song you already have updates that pick, so the
  // newest feelings win and no duplicate is created (unique index, 20260928000000_one_pick_per_song.sql).
  const feelings = {
    tags,
    valence: clampedValence,
    energy: clampedEnergy,
    embedding: pickEmbedding,
    reason_text: reasonText ?? null,
    is_public: isPublic ?? true,
    updated_at: new Date().toISOString(),
  };
  const saved = await savePick(supabase, profileId, song.id, feelings);
  if ("error" in saved) {
    return NextResponse.json({ error: saved.error }, { status: 500 });
  }
  const { pick, updated } = saved;

  refreshClusterAfterResponse(supabase, profileId, "insert");
  return NextResponse.json({ song, pick, updated });
}

type Supabase = ReturnType<typeof createServerClient>;
type Feelings = { tags: string[]; valence: number; energy: number; embedding: number[]; reason_text: string | null; is_public: boolean; updated_at: string };

/**
 * Updates the profile's existing pick for this song, or inserts one. Update first: a re-pick is then
 * one round trip, and a new pick (the update matches no row) is two. Retries as an update if a
 * concurrent save won the insert.
 */
async function savePick(supabase: Supabase, profileId: string, songId: string, feelings: Feelings) {
  const update = () =>
    supabase.from("song_picks").update(feelings).eq("profile_id", profileId).eq("song_id", songId).select().maybeSingle();

  const { data: existing, error: updateError } = await update();
  if (updateError) return { error: updateError.message };
  if (existing) return { pick: existing, updated: true };

  const { data, error } = await supabase.from("song_picks").insert({ profile_id: profileId, song_id: songId, ...feelings }).select().single();
  if (error?.code === "23505") {
    const retry = await update();
    return retry.error || !retry.data ? { error: retry.error?.message ?? "Couldn't update the pick" } : { pick: retry.data, updated: true };
  }
  return error ? { error: error.message } : { pick: data, updated: false };
}

/**
 * Changes how one of your songs feels: new tags and/or mood-circle position. The pick keeps its id;
 * its matching vector is rebuilt from the song's embedding. No MusicBrainz or Gemini call.
 */
export async function PATCH(req: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id, tags, valence, energy } = (await req.json()) as { id?: string; tags?: string[]; valence?: number; energy?: number };
  if (!id || !Array.isArray(tags) || tags.length === 0 || tags.length > 3) {
    return NextResponse.json({ error: "id and 1-3 tags are required" }, { status: 400 });
  }
  const invalidTags = tags.filter((t) => !isValidTag(t));
  if (invalidTags.length > 0) {
    return NextResponse.json({ error: `Invalid tags: ${invalidTags.join(", ")}` }, { status: 400 });
  }

  const supabase = createServerClient();
  // Scoped to the caller's own picks: someone else's pick id simply isn't found.
  // One read: the pick and its song's embedding together.
  const { data: existing, error: findError } = await supabase.from("song_picks").select("id, songs(embedding)").eq("id", id).eq("profile_id", profileId).maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Pick not found" }, { status: 404 });
  const song = (existing as unknown as { songs: { embedding: string | number[] | null } | null }).songs;
  if (!song?.embedding) return NextResponse.json({ error: "Catalog song is missing an embedding" }, { status: 500 });

  const clampedValence = clampEmotionValue(valence ?? 0);
  const clampedEnergy = clampEmotionValue(energy ?? 0);
  const { data: pick, error } = await supabase
    .from("song_picks")
    .update({
      tags,
      valence: clampedValence,
      energy: clampedEnergy,
      embedding: buildPickEmbedding(parseVector(song.embedding), clampedValence, clampedEnergy),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("profile_id", profileId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  refreshClusterAfterResponse(supabase, profileId, "update");
  return NextResponse.json({ pick });
}

/** Removes one of your songs (DELETE /api/picks?id=<pick id>). */
export async function DELETE(req: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param is required" }, { status: 400 });

  const supabase = createServerClient();
  const { data, error } = await supabase.from("song_picks").delete().eq("id", id).eq("profile_id", profileId).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "Pick not found" }, { status: 404 });

  refreshClusterAfterResponse(supabase, profileId, "delete");
  return NextResponse.json({ deleted: id });
}
