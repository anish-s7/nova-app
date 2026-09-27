import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { generateSongContext } from "@/lib/gemini/generateSongContext";
import { findCover } from "@/lib/cover-art";
import { resolveSong } from "@/lib/musicbrainz/client";
import { clampEmotionValue } from "@/lib/emotion";
import { buildPickEmbedding } from "@/lib/matching/pickEmbedding";
import { MAX_PICK_TAGS } from "@/lib/tags";
import { resolvePickTags } from "@/lib/matching/songTags";
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

  if (tags.length > MAX_PICK_TAGS) {
    return NextResponse.json({ error: `At most ${MAX_PICK_TAGS} tags` }, { status: 400 });
  }

  const supabase = createServerClient();

  // Tags must be this song's own (song_tags, fetched on the feel step by the same title/artist) or
  // one of the original fixed tags. Checked before any MusicBrainz/Gemini work.
  const checked = await resolvePickTags(supabase, [{ title, artist }], tags);
  if ("invalid" in checked) {
    return NextResponse.json({ error: `Invalid tags: ${checked.invalid.join(", ")}` }, { status: 400 });
  }

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
    // The client's art is only trusted when it's Spotify's CDN (the import). Anything else, like the
    // mock catalog's local /covers/*.png paths, would be stored as a broken URL and skip the lookup.
    const trustedArt = albumArtUrl && /^https:\/\/i\.scdn\.co\//.test(albumArtUrl) ? albumArtUrl : null;
    const coverArt = trustedArt ?? (await findCover(canonicalTitle, canonicalArtist, resolution?.releaseIds));

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
    tag_whys: checked.tagWhys,
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

  // Keep the galaxy label current. A failure here must not fail the pick, which is already saved:
  // the next pick, or the next galaxy load, recomputes it.
  // Service-role client: primary_cluster is a derived label the backend writes, and the
  // `authenticated` role can only update profiles.display_name.
  try {
    await refreshPrimaryCluster(supabase, profileId);
  } catch (err) {
    console.error("refreshPrimaryCluster failed after pick insert:", err);
  }

  return NextResponse.json({ song, pick, updated });
}

type Supabase = ReturnType<typeof createServerClient>;
type Feelings = { tags: string[]; tag_whys: string[]; valence: number; energy: number; embedding: number[]; reason_text: string | null; is_public: boolean; updated_at: string };

/** Updates the profile's existing pick for this song, or inserts one. Retries as an update if a concurrent save won the insert. */
async function savePick(supabase: Supabase, profileId: string, songId: string, feelings: Feelings) {
  const update = () =>
    supabase.from("song_picks").update(feelings).eq("profile_id", profileId).eq("song_id", songId).select().maybeSingle();

  const { data: existing, error: findError } = await supabase.from("song_picks").select("id").eq("profile_id", profileId).eq("song_id", songId).maybeSingle();
  if (findError) return { error: findError.message };

  if (existing) {
    const { data, error } = await update();
    return error || !data ? { error: error?.message ?? "Couldn't update the pick" } : { pick: data, updated: true };
  }

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
  if (!id || !Array.isArray(tags) || tags.length === 0 || tags.length > MAX_PICK_TAGS) {
    return NextResponse.json({ error: `id and 1-${MAX_PICK_TAGS} tags are required` }, { status: 400 });
  }

  const supabase = createServerClient();
  // Scoped to the caller's own picks: someone else's pick id simply isn't found.
  const { data: existing, error: findError } = await supabase
    .from("song_picks")
    .select("id, song_id, tags, tag_whys")
    .eq("id", id)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Pick not found" }, { status: 404 });
  const { data: song } = await supabase.from("songs").select("title, artist, embedding").eq("id", existing.song_id).maybeSingle();
  if (!song?.embedding) return NextResponse.json({ error: "Catalog song is missing an embedding" }, { status: 500 });

  // Tags the pick already has stay valid (the catalog's official title can differ a little from the
  // one searched when it was saved); new ones must be the song's own or the original fixed tags.
  const kept = new Map(existing.tags.map((t, i) => [t, existing.tag_whys?.[i] ?? ""]));
  const checked = await resolvePickTags(supabase, [{ title: song.title, artist: song.artist }], tags.filter((t) => !kept.has(t)));
  if ("invalid" in checked) {
    return NextResponse.json({ error: `Invalid tags: ${checked.invalid.join(", ")}` }, { status: 400 });
  }
  const newWhys = new Map(tags.filter((t) => !kept.has(t)).map((t, i) => [t, checked.tagWhys[i]]));
  const tagWhys = tags.map((t) => (kept.has(t) ? kept.get(t)! : newWhys.get(t)!));

  const clampedValence = clampEmotionValue(valence ?? 0);
  const clampedEnergy = clampEmotionValue(energy ?? 0);
  const { data: pick, error } = await supabase
    .from("song_picks")
    .update({
      tags,
      tag_whys: tagWhys,
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

  try {
    await refreshPrimaryCluster(supabase, profileId);
  } catch (err) {
    console.error("refreshPrimaryCluster failed after pick update:", err);
  }
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

  try {
    await refreshPrimaryCluster(supabase, profileId);
  } catch (err) {
    console.error("refreshPrimaryCluster failed after pick delete:", err);
  }
  return NextResponse.json({ deleted: id });
}
