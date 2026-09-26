/**
 * Valence/energy come from a user-dragged point on a circular slider,
 * both ranging -1..1. This weight scales them before they're appended to
 * a song-embedding average so they meaningfully influence pgvector
 * similarity without drowning out or being drowned out by the 768
 * content dimensions. Tune by eye during the hackathon if matches feel
 * too content-driven or too mood-driven.
 */
export const EMOTION_WEIGHT = 5;

export function clampEmotionValue(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}
