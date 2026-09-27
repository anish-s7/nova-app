/**
 * Batch job: recomputes topic_clusters and profiles.primary_topic_cluster_id from everyone's
 * picks. HDBSCAN (lib/matching/hdbscan.ts) discovers the cluster structure — including a noise
 * bucket for profiles that don't fit anywhere yet — over each profile's mood-stripped average pick
 * embedding (lib/matching/topicClusterVector.ts). A Gemini call names each new or
 * meaningfully-drifted cluster from a sample of its real members' picks (title/artist/tags only —
 * never raw embeddings, never a membership decision — lib/gemini/nameTopicCluster.ts). Run by hand
 * at first (same pattern as recompute-pick-embeddings.ts), promote to a cron job later:
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/recompute-topic-clusters.ts [--min-cluster-size=3]
 *
 * Needs migration 20260929000000 (topic_clusters, profiles.primary_topic_cluster_id) applied to
 * the target project. lib/matching/refreshPrimaryCluster.ts (assign-to-nearest-centroid, no LLM)
 * covers the gap between runs of this script.
 *
 * This job never deletes a topic_clusters row or sets superseded_by — an old cluster that finds no
 * match this run just keeps its stale centroid/member_count until a later run claims it again or
 * someone retires it by hand.
 */
import { createServerClient } from "../lib/supabase/server";
import { parseVector } from "../lib/supabase/vector";
import { hdbscan } from "../lib/matching/hdbscan";
import { topicVectorFor } from "../lib/matching/topicClusterVector";
import { applyStabilityMargin, type ClusterCentroid } from "../lib/matching/assignTopicCluster";
import { cosineDistance } from "../lib/matching/cosineSimilarity";
import { colorForClusterIndex } from "../lib/matching/topicClusterColor";
import { nameTopicCluster, type TopicClusterSamplePick } from "../lib/gemini/nameTopicCluster";

const MIN_CLUSTER_SIZE = Number(process.argv.find((a) => a.startsWith("--min-cluster-size="))?.split("=")[1]) || 3;
// An HDBSCAN cluster this close to an existing one's centroid is treated as the same cluster
// (reuse its id), not a new one. Below this second, tighter threshold it's also renamed.
const REUSE_SIMILARITY = 0.85;
const RENAME_SIMILARITY = 0.95;
const SAMPLE_SIZE = 10;
const MIN_GEMINI_INTERVAL_MS = 4500;
const PAGE = 500;

type PickRow = { profile_id: string; embedding: unknown; tags: string[]; songs: { title: string; artist: string } | null };

function sampleMemberPicks(profileIds: string[], picksByProfile: Map<string, PickRow[]>): TopicClusterSamplePick[] {
  const samples: TopicClusterSamplePick[] = [];
  outer: for (const id of profileIds) {
    for (const pick of picksByProfile.get(id) ?? []) {
      if (!pick.songs) continue;
      samples.push({ title: pick.songs.title, artist: pick.songs.artist, tags: pick.tags });
      if (samples.length >= SAMPLE_SIZE) break outer;
    }
  }
  return samples;
}

async function main() {
  const supabase = createServerClient();

  const picks: PickRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("song_picks")
      .select("profile_id, embedding, tags, songs(title, artist)")
      .order("profile_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Failed to load picks: ${error.message}`);
    picks.push(...((data ?? []) as unknown as PickRow[]));
    if (!data || data.length < PAGE) break;
  }

  const picksByProfile = new Map<string, PickRow[]>();
  for (const p of picks) picksByProfile.set(p.profile_id, [...(picksByProfile.get(p.profile_id) ?? []), p]);

  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, primary_topic_cluster_id");
  if (profilesError) throw new Error(`Failed to load profiles: ${profilesError.message}`);

  const profileVectors = (profiles ?? [])
    .map((profile) => ({
      profileId: profile.id,
      currentClusterId: profile.primary_topic_cluster_id,
      vector: topicVectorFor((picksByProfile.get(profile.id) ?? []).map((p) => parseVector(p.embedding))),
    }))
    .filter((p): p is { profileId: string; currentClusterId: string | null; vector: number[] } => p.vector !== null);

  if (profileVectors.length === 0) {
    console.log("No profiles with picks yet — nothing to cluster.");
    return;
  }

  const { labels, centroids } = hdbscan(
    profileVectors.map((p) => p.vector),
    MIN_CLUSTER_SIZE,
  );
  const clusterCount = centroids.length;
  console.log(`HDBSCAN found ${clusterCount} cluster(s) over ${profileVectors.length} profile(s) (min cluster size ${MIN_CLUSTER_SIZE}).`);

  const { data: existingRows, error: existingError } = await supabase
    .from("topic_clusters")
    .select("id, label, short, centroid")
    .is("superseded_by", null);
  if (existingError) throw new Error(`Failed to load topic_clusters: ${existingError.message}`);
  const existing = (existingRows ?? []).map((c) => ({ ...c, centroid: c.centroid ? parseVector(c.centroid) : null }));
  const claimed = new Set<string>();

  const clusterIdForIndex: string[] = [];
  for (let k = 0; k < clusterCount; k++) {
    const centroid = centroids[k];
    const memberProfileIds = labels.flatMap((label, i) => (label === k ? [profileVectors[i].profileId] : []));

    const nearestExisting = existing
      .filter((c): c is (typeof existing)[number] & { centroid: number[] } => !!c.centroid && !claimed.has(c.id))
      .map((c) => ({ ...c, similarity: 1 - cosineDistance(centroid, c.centroid) }))
      .sort((a, b) => b.similarity - a.similarity)[0];
    const reuse = nearestExisting && nearestExisting.similarity >= REUSE_SIMILARITY ? nearestExisting : null;
    const needsNaming = !reuse || reuse.similarity < RENAME_SIMILARITY;

    let label = reuse?.label ?? "";
    let short = reuse?.short ?? "";
    let description: string | undefined;

    if (needsNaming) {
      const started = Date.now();
      const samples = sampleMemberPicks(memberProfileIds, picksByProfile);
      if (samples.length === 0) throw new Error(`Cluster ${k} (${memberProfileIds.length} members) has no resolved songs to name it from`);
      const { name } = await nameTopicCluster(samples);
      label = name.label;
      short = name.short;
      description = name.description;
      const wait = MIN_GEMINI_INTERVAL_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }

    if (reuse) {
      claimed.add(reuse.id);
      const { error } = await supabase
        .from("topic_clusters")
        .update({ label, short, ...(description ? { description } : {}), centroid, member_count: memberProfileIds.length })
        .eq("id", reuse.id);
      if (error) throw new Error(`Failed to update topic_cluster ${reuse.id}: ${error.message}`);
      clusterIdForIndex.push(reuse.id);
      console.log(
        `Cluster ${k}: ${needsNaming ? "renamed" : "reused"} "${label}" (${memberProfileIds.length} members, ${(nearestExisting!.similarity * 100).toFixed(0)}% match to its old centroid)`,
      );
    } else {
      const color = colorForClusterIndex(existing.length + k);
      const { data: inserted, error } = await supabase
        .from("topic_clusters")
        .insert({ label, short, description, color, centroid, member_count: memberProfileIds.length })
        .select("id")
        .single();
      if (error) throw new Error(`Failed to insert topic_cluster: ${error.message}`);
      clusterIdForIndex.push(inserted.id);
      console.log(`Cluster ${k}: new "${label}" (${memberProfileIds.length} members)`);
    }
  }

  const finalCentroids: ClusterCentroid[] = clusterIdForIndex.map((id, k) => ({ id, centroid: centroids[k] }));

  let moved = 0;
  let unassigned = 0;
  for (let i = 0; i < profileVectors.length; i++) {
    const { profileId, currentClusterId, vector } = profileVectors[i];
    const label = labels[i];
    const rawTarget = label === -1 ? null : clusterIdForIndex[label];
    const target =
      rawTarget === null || currentClusterId === null || rawTarget === currentClusterId
        ? rawTarget
        : applyStabilityMargin(rawTarget, currentClusterId, vector, finalCentroids);

    if (target !== currentClusterId) {
      const { error } = await supabase.from("profiles").update({ primary_topic_cluster_id: target }).eq("id", profileId);
      if (error) throw new Error(`Failed to update profile ${profileId}: ${error.message}`);
      moved++;
    }
    if (target === null) unassigned++;
  }

  console.log(`\nDone: ${clusterCount} cluster(s), ${moved} profile(s) moved, ${unassigned} unassigned (noise).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
