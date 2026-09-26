import { getGeminiClient, GEMINI_EMBEDDING_MODEL } from "./client";

/** Embeds a single motivation label into a vector for pgvector storage. */
export async function embedMotivation(label: string): Promise<number[]> {
  const ai = getGeminiClient();

  const response = await ai.models.embedContent({
    model: GEMINI_EMBEDDING_MODEL,
    contents: label,
  });

  const embedding = response.embeddings?.[0]?.values;
  if (!embedding) {
    throw new Error("Gemini returned no embedding for motivation label");
  }

  return embedding;
}
