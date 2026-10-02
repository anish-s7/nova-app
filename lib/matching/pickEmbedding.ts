import { EMOTION_WEIGHT, clampEmotionValue } from "../music/emotion";

/**
 * A pick's 770-dim matching vector: the song's 768-dim embedding scaled to unit length, then
 * this person's (valence, energy) × EMOTION_WEIGHT. The one place this formula lives — the
 * picks route, the seed script and the recompute script all call it.
 *
 * Normalizing matters: gemini-embedding-001 truncated to 768 dims isn't unit length (~0.59
 * here), so without it the weight would mean something different for every song.
 */
export function buildPickEmbedding(songEmbedding: number[], valence: number, energy: number): number[] {
  const length = Math.sqrt(songEmbedding.reduce((sum, x) => sum + x * x, 0));
  if (length === 0) throw new Error("buildPickEmbedding: song embedding is all zeros");
  return [
    ...songEmbedding.map((x) => x / length),
    clampEmotionValue(valence) * EMOTION_WEIGHT,
    clampEmotionValue(energy) * EMOTION_WEIGHT,
  ];
}
