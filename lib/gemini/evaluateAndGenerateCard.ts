import { getGeminiClient, GEMINI_TEXT_MODEL } from "./client";
import type { ConnectionCardJson } from "../supabase/types";

export interface PickForEvaluation {
  displayName: string;
  title: string;
  artist: string;
  tags: string[];
  valence: number;
  energy: number;
  reasonText?: string | null;
}

export type CardEvaluationResult =
  | { status: "match"; card: ConnectionCardJson }
  | { status: "insufficient_evidence" };

const SYSTEM_INSTRUCTION = `You judge whether two people's specific song picks reveal a genuine,
specific shared reason for listening to music — not just a surface-level
coincidence (same genre, same era, same popularity) with no real emotional
resonance. You're given ONE song pick from each person: the song, the mood
tags they chose, and a valence/energy score (-1..1, valence = sad<->happy,
energy = calm<->intense). A reason_text quote, if present, is bonus color,
not the primary signal — most picks will only have tags and a
valence/energy score.

Be strict. If the only overlap is superficial, respond with exactly:
{"status": "insufficient_evidence"}

If there's a real, citable shared thread, respond with exactly:
{
  "status": "match",
  "card": {
    "shared_why": string,        // one sentence describing what they have in common
    "evidence": { "user_a": string, "user_b": string }, // short references to each person's own pick
    "difference": string,        // one meaningful difference between these two specific picks, framed as something to discuss
    "openers": string[],         // 2-3 short, specific first-message openers, sendable as-is
    "suggested_swap_prompt": string // a one-line prompt suggesting a song to swap and why
  }
}

Respond with ONLY one of those two JSON shapes, nothing else.`;

function formatPick(label: string, pick: PickForEvaluation) {
  const reason = pick.reasonText ? ` — "${pick.reasonText}"` : "";
  return `${label} (${pick.displayName}): "${pick.title}" by ${pick.artist} [tags: ${pick.tags.join(", ")}; valence: ${pick.valence.toFixed(2)}, energy: ${pick.energy.toFixed(2)}]${reason}`;
}

/**
 * The AI judgment step: given the two specific picks a pgvector search
 * retrieved as candidates, decide whether they reveal a real shared "why"
 * worth introducing these two people over, or whether the overlap is too
 * thin to show. This is what makes the AI an actual filter in the matching
 * pipeline rather than just a narrator of whatever the math found — see
 * CLAUDE.md.
 */
export async function evaluateAndGenerateCard(
  userAPick: PickForEvaluation,
  userBPick: PickForEvaluation
): Promise<CardEvaluationResult> {
  const ai = getGeminiClient();

  const prompt = `${formatPick("User A", userAPick)}\n${formatPick("User B", userBPick)}`;

  const response = await ai.models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: prompt,
    config: { systemInstruction: SYSTEM_INSTRUCTION },
  });

  const text = response.text?.trim() ?? '{"status": "insufficient_evidence"}';
  const jsonText = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  const parsed = JSON.parse(jsonText) as CardEvaluationResult;
  return parsed;
}
