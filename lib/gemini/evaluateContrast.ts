import { getGeminiClient, GEMINI_TEXT_MODEL } from "./client";
import type { PickForEvaluation } from "./evaluateAndGenerateCard";
import type { ConnectionCardJson } from "../supabase/types";

export type ContrastEvaluationResult =
  | { status: "contrast"; card: ConnectionCardJson }
  | { status: "insufficient_evidence" };

const SYSTEM_INSTRUCTION = `You judge whether two people who picked the SAME song feel it in genuinely
different ways, and if so, write a "contrast card" that introduces them to each
other. This is for a feature where someone chooses to wander outside their usual
neighborhood, so the interesting part is the difference, anchored by one real
thing they share: the song.

You're given ONE pick from each person: the same song, the mood tags they chose,
and a valence/energy score (-1..1, valence = sad<->happy, energy = calm<->intense).
A reason_text quote, if present, is bonus color, not the primary signal.

Be strict. Respond with exactly {"status": "insufficient_evidence"} if:
- the two picks are basically the same feeling (tags and scores barely differ), or
- you can't point to a specific difference in the tags or scores, or
- the difference would just be invented flavor with no basis in what you were given.

Otherwise respond with exactly:
{
  "status": "contrast",
  "card": {
    "kind": "contrast",
    "shared_why": string,   // one sentence: the song they both picked, framed as the thread between them
    "evidence": { "user_a": string, "user_b": string }, // one short line each: how THAT person feels the song, grounded in their own tags/scores
    "difference": string,   // one sentence: how the two feelings differ, citing the actual gap (e.g. one calm and sad, one intense and hopeful)
    "openers": string[],    // 2-3 short first messages that invite the other person's side, sendable as-is
    "suggested_swap_prompt": string // a one-line prompt suggesting they trade a song that sits on the other side of the feeling
  }
}

Never mention numbers like "0.4". Describe the feeling in words. Do not invent facts
about the song, the artist, or either person beyond what you were given.
Respond with ONLY one of those two JSON shapes, nothing else.`;

function formatPick(label: string, pick: PickForEvaluation) {
  const reason = pick.reasonText ? ` — "${pick.reasonText}"` : "";
  return `${label} (${pick.displayName}): "${pick.title}" by ${pick.artist} [tags: ${pick.tags.join(", ")}; valence: ${pick.valence.toFixed(2)}, energy: ${pick.energy.toFixed(2)}]${reason}`;
}

function isContrastCard(v: unknown): v is ConnectionCardJson {
  const c = v as ConnectionCardJson | undefined;
  return (
    !!c &&
    typeof c.shared_why === "string" &&
    typeof c.difference === "string" &&
    typeof c.suggested_swap_prompt === "string" &&
    typeof c.evidence?.user_a === "string" &&
    typeof c.evidence?.user_b === "string" &&
    Array.isArray(c.openers) &&
    c.openers.length > 0 &&
    c.openers.every((o) => typeof o === "string")
  );
}

/**
 * The Wander judgment step. Where evaluateAndGenerateCard asks "do these two
 * share a real thread?", this asks "do these two, who picked the same song,
 * feel it differently in a way worth talking about?" It is still a filter, not
 * a narrator: a weak or invented difference comes back as insufficient
 * evidence and the candidate is dropped.
 *
 * Only plain {title, artist, tags, valence, energy} strings go to Gemini,
 * never a Spotify payload (see CLAUDE.md).
 */
export async function evaluateContrastCard(
  userAPick: PickForEvaluation,
  userBPick: PickForEvaluation
): Promise<ContrastEvaluationResult> {
  const ai = getGeminiClient();
  const prompt = `${formatPick("User A", userAPick)}\n${formatPick("User B", userBPick)}`;

  const response = await ai.models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: prompt,
    config: { systemInstruction: SYSTEM_INSTRUCTION },
  });

  const text = response.text?.trim() ?? "";
  const jsonText = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  let parsed: { status?: string; card?: unknown };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { status: "insufficient_evidence" };
  }

  if (parsed.status !== "contrast" || !isContrastCard(parsed.card)) return { status: "insufficient_evidence" };

  return {
    status: "contrast",
    card: {
      ...parsed.card,
      kind: "contrast",
      // The song comes from our own row, not from the model.
      shared_song: { title: userAPick.title, artist: userAPick.artist },
    },
  };
}
