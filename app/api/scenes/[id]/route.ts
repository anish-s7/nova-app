import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { getSceneGateway } from "@/lib/scenes/sceneGateway";
import { getNovelSongForScene } from "@/lib/scenes/novelSong";

/**
 * One real music-community destination (docs/plans/galaxy-communities.md, revised-path step 5): the
 * scene itself, a novel song from it the viewer doesn't already have plus why they might like it, and
 * the viewer's closest bridge into it. Service-role client — this spans users (gateway ranking, scene
 * membership), same as the rest of the galaxy path. No Gemini calls beyond the one relevance
 * explanation already made lazily inside getNovelSongForScene; nothing here is cached yet (see plan's
 * "explicitly deferred" list — that's a later optimization, not a correctness requirement for step 5).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewerId = await getCurrentProfileId();
  if (!viewerId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id: sceneId } = await params;
  const supabase = createServerClient();

  const { data: scene, error: sceneErr } = await supabase.from("song_scenes").select("id, label, description, status").eq("id", sceneId).maybeSingle();
  if (sceneErr) return NextResponse.json({ error: sceneErr.message }, { status: 500 });
  if (!scene || scene.status !== "published") return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  try {
    const [gateway, novelSong] = await Promise.all([
      getSceneGateway(supabase, viewerId, sceneId),
      getNovelSongForScene(supabase, viewerId, sceneId),
    ]);
    // Locked, not broken: no eligible gateway in the viewer's own pool yet (see the plan's gateway-detection
    // section) — real state, not an error.
    return NextResponse.json({
      scene: { id: scene.id, label: scene.label, description: scene.description },
      gateway,
      novelSong,
      locked: !gateway,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scene lookup failed" }, { status: 500 });
  }
}
