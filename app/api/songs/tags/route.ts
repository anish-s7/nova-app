import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { ensureSongTags } from "@/lib/matching/songTags";

/**
 * The tags people choose from for one song (POST { title, artist }). Stored ones come back
 * instantly; a song nobody has described yet gets one Gemini call, stored for everyone. POST
 * because it can write. Falls back to the original fixed tags if Gemini fails (`source`).
 */
export async function POST(req: NextRequest) {
  if (!(await getCurrentProfileId())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { title?: string; artist?: string } | null;
  const title = body?.title?.trim().slice(0, 200) ?? "";
  const artist = body?.artist?.trim().slice(0, 200) ?? "";
  if (!title || !artist) return NextResponse.json({ error: "title and artist are required" }, { status: 400 });

  try {
    return NextResponse.json(await ensureSongTags(createServerClient(), title, artist));
  } catch (err) {
    console.error("POST /api/songs/tags failed:", err);
    return NextResponse.json({ error: "Couldn't load tags for this song." }, { status: 500 });
  }
}
