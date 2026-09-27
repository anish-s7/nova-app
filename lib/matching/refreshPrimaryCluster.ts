import type { SupabaseClient } from "@supabase/supabase-js";
import { primaryClusterFor } from "../cluster-assign";
import { assignNearestCluster } from "./assignTopicCluster";
import { topicVectorFor } from "./topicClusterVector";
import { parseVector } from "../supabase/vector";
import type { Database } from "../supabase/types";

/**
 * Cheap, no-LLM reassignment: places a profile at its nearest existing topic_clusters centroid
 * (with the stability rule, lib/matching/assignTopicCluster.ts, so it doesn't flap between two
 * similar clusters on every pick). Called after every new pick, and lazily for the viewer when the
 * galaxy loads. Never creates, renames, or moves a centroid, and never assigns a profile that
 * HDBSCAN would call noise into some nearby cluster anyway — that's scripts/recompute-topic-clusters.ts,
 * a separate batch job. Returns the assigned cluster id, or null (no picks yet, or no
 * topic_clusters row has a centroid yet — i.e. always, until that job has run once).
 *
 * TRANSITION (until the app-wiring phase): it also keeps the legacy profiles.primary_cluster label
 * current (the tag vote in lib/cluster-assign.ts), because the galaxy RPCs, galaxyWindow, findMatches
 * and real-api still read that column. Without it, new users never get a galaxy group. Remove this
 * bridge when those readers move to primary_topic_cluster_id and primary_cluster is dropped.
 */
export async function refreshPrimaryCluster(supabase: SupabaseClient<Database>, profileId: string): Promise<string | null> {
  const [{ data: picks, error: picksError }, { data: profile }, { data: clusterRows, error: clustersError }] = await Promise.all([
    supabase.from("song_picks").select("embedding, tags, valence, energy").eq("profile_id", profileId),
    supabase.from("profiles").select("primary_topic_cluster_id, primary_cluster").eq("id", profileId).maybeSingle(),
    supabase.from("topic_clusters").select("id, centroid").is("superseded_by", null).not("centroid", "is", null),
  ]);
  if (picksError) throw new Error(`refreshPrimaryCluster failed to load picks: ${picksError.message}`);
  if (clustersError) throw new Error(`refreshPrimaryCluster failed to load topic clusters: ${clustersError.message}`);

  // Legacy label (transition bridge, see above): tag vote, no LLM, no embeddings.
  const legacy = primaryClusterFor(picks ?? [], profileId);
  if (legacy && legacy !== profile?.primary_cluster) {
    const { error: legacyError } = await supabase.from("profiles").update({ primary_cluster: legacy }).eq("id", profileId);
    if (legacyError) console.error(`refreshPrimaryCluster: couldn't write the legacy primary_cluster: ${legacyError.message}`);
  }

  const vector = topicVectorFor((picks ?? []).map((p) => parseVector(p.embedding)));
  if (!vector) return null;

  const clusters = (clusterRows ?? []).map((c) => ({ id: c.id, centroid: parseVector(c.centroid) }));
  const cluster = assignNearestCluster(vector, clusters, profile?.primary_topic_cluster_id ?? null);

  if (cluster !== (profile?.primary_topic_cluster_id ?? null)) {
    const { error: updateError } = await supabase.from("profiles").update({ primary_topic_cluster_id: cluster }).eq("id", profileId);
    if (updateError) throw new Error(`refreshPrimaryCluster failed to write: ${updateError.message}`);
  }
  return cluster;
}
