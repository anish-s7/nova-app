import { getGeminiClient, GEMINI_EMBEDDING_MODEL } from "./client";

const MOCK_EMBEDDING_DIMENSION = 768;

function createMockEmbedding(label: string): number[] {
  let state = 2166136261;

  for (let index = 0; index < label.length; index += 1) {
    state ^= label.charCodeAt(index);
    state = Math.imul(state, 16777619) >>> 0;
  }

  if (state === 0) {
    state = 0x9e3779b9;
  }

  const embedding = Array.from({ length: MOCK_EMBEDDING_DIMENSION }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return (state / 0xffffffff) * 2 - 1;
  });

  const magnitude = Math.sqrt(
    embedding.reduce((sum, value) => sum + value * value, 0)
  );

  return embedding.map((value) => value / magnitude);
}

/** Embeds a single motivation label into a vector for pgvector storage. */
export async function embedMotivation(label: string): Promise<number[]> {
  if (process.env.USE_MOCK_AI === "true") {
    return createMockEmbedding(label);
  }

  const ai = getGeminiClient();

  const response = await ai.models.embedContent({
    model: GEMINI_EMBEDDING_MODEL,
    contents: label,
    config: { outputDimensionality: 768 },
  });

  const embedding = response.embeddings?.[0]?.values;
  if (!embedding) {
    throw new Error("Gemini returned no embedding for motivation label");
  }

  if (embedding.length !== 768) {
    throw new Error(`Expected a 768-dimensional embedding, received ${embedding.length}`);
  }

  return embedding;
}
