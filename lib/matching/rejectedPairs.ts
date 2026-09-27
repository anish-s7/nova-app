/**
 * Pairs the AI already turned down, keyed by both pick counts so a new pick on either side earns a
 * fresh look. Shared by findMatches (GET /api/match) and POST /api/cards, so opening the card of
 * someone who isn't a match answers instantly the second time instead of re-asking Gemini.
 * In-memory only (rejections aren't stored), so a restart or another server instance just re-asks.
 */
const rejected = new Set<string>();

export function rejectionKey(profileA: string, profileB: string, picksA: number, picksB: number) {
  return profileA < profileB ? `${profileA}:${profileB}:${picksA}:${picksB}` : `${profileB}:${profileA}:${picksB}:${picksA}`;
}

export const wasRejected = (key: string) => rejected.has(key);
export const rememberRejection = (key: string) => void rejected.add(key);
