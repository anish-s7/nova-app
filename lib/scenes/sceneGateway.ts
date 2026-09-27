import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export type SceneGateway = {
  profileId: string;
  displayName: string;
  /** primary_cluster — for drawing the gateway's star with its own "why" color, same as any other node. */
  cluster: string;
  similarity: number;
  songPickId: string;
  songId: string;
  songTitle: string;
  songArtist: string;
  membershipWeight: number;
};

/**
 * The viewer's closest bridge into a scene — never "a member of both worlds," a member of the scene
 * with a real, ranked connection to the viewer (docs/plans/galaxy-communities.md). Scoped to the
 * viewer's own galaxy_pool (scene_pool SQL function does the scoping) so the result is always someone
 * hop's assertHopAllowed already permits centering on. Returns null if no one in the viewer's pool has
 * a public pick in this scene — a locked scene, not a broken one.
 */
export async function getSceneGateway(supabase: Client, viewerId: string, sceneId: string): Promise<SceneGateway | null> {
  const { data, error } = await supabase.rpc("scene_pool", { target_profile_id: viewerId, target_scene_id: sceneId });
  if (error) throw new Error(`scene_pool failed: ${error.message}`);
  const best = (data ?? [])[0];
  if (!best) return null;

  // scene_pool doesn't carry cluster (it wraps galaxy_pool's ranking columns, not its full row) — a
  // second, cheap lookup rather than a migration change just to add one display-only column.
  const { data: profile } = await supabase.from("profiles").select("primary_cluster").eq("id", best.profile_id).maybeSingle();

  return {
    profileId: best.profile_id,
    displayName: best.display_name,
    cluster: profile?.primary_cluster ?? "unassigned",
    similarity: best.similarity,
    songPickId: best.song_pick_id,
    songId: best.song_id,
    songTitle: best.song_title,
    songArtist: best.song_artist,
    membershipWeight: best.membership_weight,
  };
}
