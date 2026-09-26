import type { ConnectionCardJson } from "../supabase/types";

/**
 * connection_cards stores user_a/user_b as an unordered pair (smaller id
 * first), but evaluateAndGenerateCard's card.evidence.user_a always refers
 * to whichever pick was passed first (the requester), not whichever id is
 * smaller. Without this, evidence.user_a only actually matches the row's
 * user_a when the requester happens to have the smaller id — the other
 * half the time, a reader trusting evidence.user_a gets the wrong person's
 * evidence. Call this right before upserting so evidence always lines up
 * with the stored user_a/user_b ordering.
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
  };
}
