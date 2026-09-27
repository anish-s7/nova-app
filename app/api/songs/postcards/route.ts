import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { ensureSongPostcards } from "@/lib/matching/songPostcards";

/**
 * Which "it feels like…" postcards to show first for one song (POST { title, artist }), best fit
 * first. Stored per song after one Gemini call; the rest of the deck is always available too.
 * POST because it can write. `source: "fallback"` = Gemini was unavailable, default order.
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
    return NextResponse.json(await ensureSongPostcards(createServerClient(), title, artist));
  } catch (err) {
    console.error("POST /api/songs/postcards failed:", err);
    return NextResponse.json({ error: "Couldn't load postcards for this song." }, { status: 500 });
  }
}
