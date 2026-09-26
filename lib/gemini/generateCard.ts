import { getGeminiClient, GEMINI_TEXT_MODEL } from "./client";
import type { ConnectionCardJson } from "../supabase/types";

export interface ProfileForCard {
  displayName: string;
  songs: { title: string; artist: string; reasonText: string }[];
}

const SYSTEM_INSTRUCTION = `You write "Connection Cards" that help two strangers start a conversation
based on why they listen to music. Given two people's songs and reasons,
return ONLY valid JSON matching this exact shape, nothing else:

{
  "shared_why": string,        // one sentence describing what they have in common
  "evidence": { "user_a": string, "user_b": string }, // short quotes/paraphrases from each person's own reasons
  "difference": string,        // one meaningful difference in how they use music, framed as something to discuss
  "openers": string[],         // 2-3 short, specific first-message openers, sendable as-is
  "suggested_swap_prompt": string // a one-line prompt suggesting a song to swap and why
}`;

function formatProfile(label: string, profile: ProfileForCard) {
  const songLines = profile.songs
    .map((s) => `- "${s.title}" by ${s.artist}: ${s.reasonText}`)
    .join("\n");
  return `${label} (${profile.displayName}):\n${songLines}`;
}

/** Generates a Connection Card from two users' songs + reasons. Cache the result — don't call this twice for the same pair. */
export async function generateConnectionCard(
  userA: ProfileForCard,
  userB: ProfileForCard
): Promise<ConnectionCardJson> {
  const ai = getGeminiClient();

  const prompt = `${formatProfile("User A", userA)}\n\n${formatProfile("User B", userB)}`;

  const response = await ai.models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: prompt,
    config: { systemInstruction: SYSTEM_INSTRUCTION },
  });

  const text = response.text?.trim() ?? "{}";
  const jsonText = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  return JSON.parse(jsonText) as ConnectionCardJson;
}
