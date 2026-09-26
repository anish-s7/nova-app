import type { ConnectionCardJson } from "../supabase/types";

/**
 * connection_cards stores user_a/user_b as an unordered pair (smaller id
 * first), but the AI writes card.evidence.user_a and threads[].song_a /
 * evidence_a for whichever person was passed first (the requester), not
 * whichever id is smaller. Without this, evidence.user_a only actually
 * matches the row's user_a when the requester happens to have the smaller
 * id — the other half the time, a reader trusting evidence.user_a gets the
 * wrong person's evidence. Call this right before upserting so evidence and
 * threads always line up with the stored user_a/user_b ordering.
 */
export function alignCardEvidence(
  card: ConnectionCardJson,
  requesterId: string,
  otherId: string
): ConnectionCardJson {
  if (requesterId < otherId) {
    return card;
  }

  return {
    ...card,
    evidence: {
      user_a: card.evidence.user_b,
      user_b: card.evidence.user_a,
    },
    ...(card.threads
      ? {
          threads: card.threads.map((t) => ({
            why: t.why,
            song_a: t.song_b,
            song_b: t.song_a,
            evidence_a: t.evidence_b,
            evidence_b: t.evidence_a,
          })),
        }
      : {}),
  };
}
