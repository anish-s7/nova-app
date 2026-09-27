import { cosineDistance } from "./cosineSimilarity";

export type ClusterCentroid = { id: string; centroid: number[] };

/**
 * The stability rule shared by lib/matching/refreshPrimaryCluster.ts (cheap per-pick
 * reassignment) and scripts/recompute-topic-clusters.ts (the batch job): a profile only moves off
 * its current cluster when another one is more than this much closer, so it doesn't flap between
 * two similar clusters on every run.
 */
export const CLUSTER_STABILITY_MARGIN = 0.2;

function nearest(vector: number[], clusters: ClusterCentroid[]): ClusterCentroid | null {
  if (clusters.length === 0) return null;
  return clusters.reduce((best, c) => (cosineDistance(vector, c.centroid) < cosineDistance(vector, best.centroid) ? c : best));
}

/**
 * Applies the stability rule: `target` is the cluster that would be assigned with no history
 * (e.g. the nearest centroid, or an HDBSCAN cluster's mapped id); pass `null` for "no opinion"
 * (HDBSCAN called the profile noise). Only actually moves a profile off `current` when `target`
 * beats it by more than `margin` (relative cosine distance) — otherwise `current` sticks.
 */
export function applyStabilityMargin(
  target: string | null,
  current: string | null,
  vector: number[],
  clusters: ClusterCentroid[],
  margin: number = CLUSTER_STABILITY_MARGIN,
): string | null {
  if (target === null || current === null || target === current) return target;
  const currentCentroid = clusters.find((c) => c.id === current);
  const targetCentroid = clusters.find((c) => c.id === target);
  if (!currentCentroid || !targetCentroid) return target;
  const distCurrent = cosineDistance(vector, currentCentroid.centroid);
  const distTarget = cosineDistance(vector, targetCentroid.centroid);
  return distTarget < distCurrent * (1 - margin) ? target : current;
}

/**
 * The nearest existing cluster to `vector` (by cosine distance), with the stability rule applied
 * against `currentClusterId`. Null when there are no clusters with a centroid yet.
 */
export function assignNearestCluster(
  vector: number[],
  clusters: ClusterCentroid[],
  currentClusterId: string | null,
  margin: number = CLUSTER_STABILITY_MARGIN,
): string | null {
  const best = nearest(vector, clusters);
  if (!best) return null;
  return applyStabilityMargin(best.id, currentClusterId, vector, clusters, margin);
}
