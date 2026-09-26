/**
 * Fixed mood/context tag taxonomy. Hardcoded (not a DB table) so it can be
 * tweaked during the hackathon without a migration.
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
