/**
 * How much the mood circle counts against the song's meaning in a pick vector
 * (see buildPickEmbedding in lib/matching/pickEmbedding.ts). The song part is
 * unit length and the (valence, energy) point sits inside the unit circle, so
 * the mood part's length is at most EMOTION_WEIGHT.
 *
 * 0.7 was chosen from the seeded picks (2026-09-26): shared feeling + related songs
 * rank highest (~0.65), opposite feelings with different songs lowest (~0.25), and
 * the same song felt oppositely lands in between (~0.6) — that pair is Wander's job,
 * not a match. At the old value of 5 the mood swamped the song (the same song felt
 * oppositely scored -0.84); at 0.35 the mood barely mattered (that pair scored 0.89).
 * Changing this means recomputing every song_picks.embedding
 * (scripts/recompute-pick-embeddings.ts).
 */
export const EMOTION_WEIGHT = 0.7;

export function clampEmotionValue(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}
