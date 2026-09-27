import type { ClusterId } from "./clusters";

/**
 * The original fixed mood/context tags. Still valid everywhere (older picks carry them, and demo
 * mode uses them), but real-mode picks now choose from tags written for each song (SongTag,
 * song_tags table, lib/gemini/generateSongTags.ts).
 */
export const TAGS = [
  "late night",
  "heartbreak",
  "hype / workout",
  "nostalgia",
  "focus / study",
  "celebration",
  "grief",
  "comfort",
  "road trip",
  "falling in love",
] as const;

export type Tag = (typeof TAGS)[number];

export function isValidTag(value: string): value is Tag {
  return (TAGS as readonly string[]).includes(value);
}

/** A tag written for one specific song (1–2 words), with the listening reason (cluster) it expresses. */
export type SongTag = { label: string; why: ClusterId };

/** Most tags a pick can carry. */
export const MAX_PICK_TAGS = 3;
