import type { SupabaseClient } from "@supabase/supabase-js";
import { primaryClusterFor } from "../cluster-assign";
import type { Database } from "../supabase/types";

/**
 * Recomputes profiles.primary_cluster from all of a profile's picks and writes it if it changed.
 * Called after every new pick, and lazily for the viewer when the galaxy loads (so profiles that
 * predate this column get a cluster without a backfill job). Returns the cluster, or null with no picks.
 */
export async function refreshPrimaryCluster(supabase: SupabaseClient<Database>, profileId: string): Promise<string | null> {
  const [{ data: picks, error }, { data: profile }] = await Promise.all([
    supabase.from("song_picks").select("tags, valence, energy").eq("profile_id", profileId),
    supabase.from("profiles").select("primary_cluster").eq("id", profileId).maybeSingle(),
  ]);
  if (error) throw new Error(`refreshPrimaryCluster failed to load picks: ${error.message}`);

  const cluster = primaryClusterFor(picks ?? []);
  if (cluster && cluster !== profile?.primary_cluster) {
    const { error: updateError } = await supabase.from("profiles").update({ primary_cluster: cluster }).eq("id", profileId);
    if (updateError) throw new Error(`refreshPrimaryCluster failed to write: ${updateError.message}`);
  }
  return cluster;
}
