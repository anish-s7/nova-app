import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

/** Published listening/music scenes, for the "enter a scene" picker. No gateway/novel-song lookup here — that's per-scene, GET /api/scenes/[id]. */
export async function GET() {
  const profileId = await getCurrentProfileId();
  if (!profileId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = createServerClient();
  const { data, error } = await supabase.from("song_scenes").select("id, label, description").eq("status", "published").order("label");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
