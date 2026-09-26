import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

export async function POST(req: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { displayName } = body as { displayName?: string };

  if (!displayName) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ id: profileId, display_name: displayName })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: data });
}

export async function GET(req: NextRequest) {
  const idParam = req.nextUrl.searchParams.get("id");
  if (!idParam) {
    return NextResponse.json({ error: "id query param is required" }, { status: 400 });
  }

  const requesterId = await getCurrentProfileId();
  // `id=me` is the signed-in user, so the client can learn its own id.
  if (idParam === "me" && !requesterId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const id = idParam === "me" ? requesterId! : idParam;
  const supabase = createServerClient();

  let picksQuery = supabase
    .from("song_picks")
    .select("id, song_id, tags, valence, energy, reason_text, is_public, created_at, songs(id, title, artist, album_art_url, spotify_track_id)")
    .eq("profile_id", id);

  // Uses the service-role client, which bypasses RLS, so privacy has to be
  // enforced here: only the profile's owner sees their private picks.
  if (requesterId !== id) {
    picksQuery = picksQuery.eq("is_public", true);
  }

  const [{ data: profile, error }, { data: picks }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).single(),
    picksQuery,
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ profile, picks: picks ?? [] });
}
