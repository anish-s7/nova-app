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
  if (process.env.USE_MOCK_AI === "true") {
    const songA = userA.songs[0];
    const songB = userB.songs[0];

    return {
      shared_why: `${userA.displayName} and ${userB.displayName} both use music to make meaningful moments feel more connected.`,
      evidence: {
        user_a: songA
          ? `${userA.displayName} chose "${songA.title}" by ${songA.artist}: ${songA.reasonText}`
          : `${userA.displayName} is still choosing a song to share.`,
        user_b: songB
          ? `${userB.displayName} chose "${songB.title}" by ${songB.artist}: ${songB.reasonText}`
          : `${userB.displayName} is still choosing a song to share.`,
      },
      difference: songA && songB
        ? `${userA.displayName} connects through "${songA.title}", while ${userB.displayName} connects through "${songB.title}".`
        : "Their listening stories are still taking shape in different ways.",
      openers: [
        `What does your song help you feel, ${userB.displayName}?`,
        "When do you usually reach for this song?",
      ],
      suggested_swap_prompt: "Swap one song that feels like good company and share why you chose it.",
    };
  }

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
