import { getGeminiClient, GEMINI_TEXT_MODEL } from "./client";

const MAX_REASON_CHARS = 200;

const PROMPT = `You extract the core emotional/situational motivation behind why someone
listens to a song, from their own short explanation. Return 1-3 short
motivation labels (3-6 words each, lowercase, no punctuation), like
"company during loneliness" or "pre-game hype". Respond with ONLY a JSON
array of strings, nothing else.

Reason: `;

/**
 * Turns a user's free-text reason for a song into structured motivation
 * labels. Truncates input to keep token usage (and cost) low — users
 * aren't expected to write essays for 5 songs.
 */
export async function extractMotivations(reasonText: string): Promise<string[]> {
  if (process.env.USE_MOCK_AI === "true") {
    return ["company during loneliness", "emotional reflection"];
  }

  const truncated = reasonText.slice(0, MAX_REASON_CHARS);
  const ai = getGeminiClient();

  const response = await ai.models.generateContent({
    model: GEMINI_TEXT_MODEL,
    contents: PROMPT + truncated,
  });

  const text = response.text?.trim() ?? "[]";
  const jsonText = text.replace(/^```json\s*/i, "").replace(/```$/, "").trim();

  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // fall through to empty result below
  }

  return [];
}
