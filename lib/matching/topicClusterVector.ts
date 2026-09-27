import { EMBEDDING_DIMENSIONS } from "../gemini/client";

/**
 * Strips a pick's (valence, energy) × EMOTION_WEIGHT tail off its 770-dim matching vector
 * (buildPickEmbedding, lib/matching/pickEmbedding.ts), leaving the unit-length 768-dim song part.
 * Topic clustering groups by what the songs mean, not by how they felt to whoever picked them.
 */
export function stripMood(pickEmbedding: number[]): number[] {
  if (pickEmbedding.length !== EMBEDDING_DIMENSIONS + 2) {
    throw new Error(`stripMood: expected a ${EMBEDDING_DIMENSIONS + 2}-dim pick embedding, got ${pickEmbedding.length}`);
  }
  return pickEmbedding.slice(0, EMBEDDING_DIMENSIONS);
}

export function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) throw new Error("averageVectors: need at least one vector");
  const dim = vectors[0].length;
  const sum = new Array(dim).fill(0);
  for (const v of vectors) {
    if (v.length !== dim) throw new Error(`averageVectors: dimension mismatch (${v.length} vs ${dim})`);
    for (let i = 0; i < dim; i++) sum[i] += v[i];
  }
  return sum.map((x) => x / vectors.length);
}

/**
 * A profile's topic vector for cluster recomputation: the mood-stripped average of their picks'
 * embeddings. Not the same thing as a match vector — there is no profile-level vector for
 * matching (see CLAUDE.md), this one exists only to place a profile in the galaxy's topic
 * clusters. Null with no picks. If a per-profile portrait embedding exists in the future, prefer
 * that over this average instead (see db/contract.md's topic_clusters recompute-job notes).
 */
export function topicVectorFor(pickEmbeddings: number[][]): number[] | null {
  if (pickEmbeddings.length === 0) return null;
  return averageVectors(pickEmbeddings.map(stripMood));
}
