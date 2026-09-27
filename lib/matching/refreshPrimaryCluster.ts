import type { SupabaseClient } from "@supabase/supabase-js";
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
 */
export async function refreshPrimaryCluster(supabase: SupabaseClient<Database>, profileId: string): Promise<string | null> {
  const [{ data: picks, error: picksError }, { data: profile }, { data: clusterRows, error: clustersError }] = await Promise.all([
    supabase.from("song_picks").select("embedding").eq("profile_id", profileId),
    supabase.from("profiles").select("primary_topic_cluster_id").eq("id", profileId).maybeSingle(),
    supabase.from("topic_clusters").select("id, centroid").is("superseded_by", null).not("centroid", "is", null),
  ]);
  if (picksError) throw new Error(`refreshPrimaryCluster failed to load picks: ${picksError.message}`);
  if (clustersError) throw new Error(`refreshPrimaryCluster failed to load topic clusters: ${clustersError.message}`);

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
