import type { SupabaseClient } from "@supabase/supabase-js";
import { primaryClusterFor } from "../cluster-assign";
import { assignNearestCluster } from "./assignTopicCluster";
import { topicVectorFor } from "./topicClusterVector";
import { isMissingTable } from "../supabase/missing-table";
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
 * The legacy text primary_cluster (the tag/slider vote over the five static clusters) is kept
 * current in both cases below, because the galaxy RPCs, galaxyWindow, findMatches and real-api still
 * read it:
 * - topic_clusters missing (migration 20260929000000 not applied): only the legacy label exists.
 * - TRANSITION BRIDGE, after the migration (applied 2026-09-27, additive: primary_cluster kept):
 *   both are written. Remove the legacy write when those readers move to primary_topic_cluster_id
 *   and primary_cluster is dropped; until then, without it, new users never get a galaxy group.
 */
export async function refreshPrimaryCluster(supabase: SupabaseClient<Database>, profileId: string): Promise<string | null> {
  const [{ data: picks, error: picksError }, { data: profile }, { data: clusterRows, error: clustersError }] = await Promise.all([
    supabase.from("song_picks").select("tags, valence, energy, embedding").eq("profile_id", profileId),
    // "*" so the same read works before (primary_cluster) and after (primary_topic_cluster_id) the migration.
    supabase.from("profiles").select("*").eq("id", profileId).maybeSingle(),
    supabase.from("topic_clusters").select("id, centroid").is("superseded_by", null).not("centroid", "is", null),
  ]);
  if (picksError) throw new Error(`refreshPrimaryCluster failed to load picks: ${picksError.message}`);

  const legacy = primaryClusterFor(picks ?? [], profileId);
  const writeLegacy = async () => {
    if (!legacy || legacy === profile?.primary_cluster) return;
    const { error: updateError } = await supabase.from("profiles").update({ primary_cluster: legacy }).eq("id", profileId);
    if (updateError) throw new Error(`refreshPrimaryCluster failed to write primary_cluster: ${updateError.message}`);
  };

  if (isMissingTable(clustersError)) {
    await writeLegacy();
    return legacy;
  }
  if (clustersError) throw new Error(`refreshPrimaryCluster failed to load topic clusters: ${clustersError.message}`);

  // Transition bridge (see above).
  try {
    await writeLegacy();
  } catch (err) {
    console.error(err);
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
