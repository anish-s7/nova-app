import {
  getGeminiClient,
  GEMINI_TEXT_MODEL,
  GEMINI_EMBEDDING_MODEL,
} from "./client";

const PROMPT = `Describe the mood and typical emotional/listening context of this song
in one short sentence (think: what situation or feeling does it fit?).
Respond with ONLY the sentence, no preamble.

Song: `;

export interface SongContext {
  contextSummary: string;
  embedding: number[];
}

/**
 * Generates a shared, catalog-level mood/context description + embedding
 * for a song. Called once per unique song (cache hit skips this entirely —
 * see app/api/user-songs/route.ts), not once per user.
 *
 * COMPLIANCE: `title` and `artist` must be plain strings only. Never pass
 * a raw Spotify API response object in here — Spotify's Developer Policy
 * prohibits feeding Spotify Content into any ML/AI model or "analyzing"
 * it for any purpose. See CLAUDE.md.
 */
export async function generateSongContext(
  title: string,
  artist: string,
): Promise<SongContext> {
  const ai = getGeminiClient();
  const songLabel = `"${title}" by ${artist}`;

  const [textResponse, embeddingResponse] = await Promise.all([
    ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: PROMPT + songLabel,
    }),
    ai.models.embedContent({
      model: GEMINI_EMBEDDING_MODEL,
      contents: songLabel,
      config: {
        outputDimensionality: 768,
      },
    }),
  ]);

  const contextSummary = textResponse.text?.trim() ?? "";
  const embedding = embeddingResponse.embeddings?.[0]?.values;

  if (!embedding) {
    throw new Error("Gemini returned no embedding for song context");
  }

  return { contextSummary, embedding };
}
