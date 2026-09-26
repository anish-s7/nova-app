import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { extractMotivations } from "@/lib/gemini/extractMotivations";
import { embedMotivation } from "@/lib/gemini/embed";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { profileId, title, artist, reasonText, spotifyTrackId, isPublic } = body as {
    profileId?: string;
    title?: string;
    artist?: string;
    reasonText?: string;
    spotifyTrackId?: string | null;
    isPublic?: boolean;
  };

  if (!profileId || !title || !artist || !reasonText) {
    return NextResponse.json(
      { error: "profileId, title, artist, and reasonText are required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data: song, error: songError } = await supabase
    .from("songs")
    .insert({
      profile_id: profileId,
      title,
      artist,
      reason_text: reasonText,
      spotify_track_id: spotifyTrackId ?? null,
      is_public: isPublic ?? true,
    })
    .select()
    .single();

  if (songError) {
    return NextResponse.json({ error: songError.message }, { status: 500 });
  }

  // Synchronous LLM step: extract motivations + embed, then store.
  // Runs inline per project constraints (no queue infra for the hackathon).
  const labels = await extractMotivations(reasonText);

  const motivationRows = await Promise.all(
    labels.map(async (label) => ({
      song_id: song.id,
      label,
      embedding: await embedMotivation(label),
    }))
  );

  if (motivationRows.length > 0) {
    const { error: motivationError } = await supabase
      .from("motivations")
      .insert(motivationRows);

    if (motivationError) {
      return NextResponse.json(
        { song, motivations: [], warning: motivationError.message },
        { status: 207 }
      );
    }
  }

  return NextResponse.json({ song, motivations: labels });
}
