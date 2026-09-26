import type { Schema } from "@google/genai";
import { getGeminiClient, GEMINI_JUDGMENT_MODELS } from "./client";

/** Errors that mean "try the next model", not "the request is wrong". */
function isRetryable(err: unknown) {
  const status = (err as { status?: number })?.status;
  return status === 429 || status === 503 || status === 500 || status === 404;
}

/**
 * One structured Gemini call: enforced JSON against `schema`, trying each judgment model in turn
 * when one is overloaded, rate-limited or unavailable. Returns the parsed object and the model that
 * answered. Throws if every model fails or the answer isn't valid JSON.
 */
export async function generateJson<T>(input: { system: string; prompt: string; schema: Schema }): Promise<{ data: T; model: string }> {
  const ai = getGeminiClient();
  let lastError: unknown;

  for (const model of GEMINI_JUDGMENT_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: input.prompt,
        config: {
          systemInstruction: input.system,
          responseMimeType: "application/json",
          responseSchema: input.schema,
          temperature: 0.4,
        },
      });
      const text = response.text?.trim();
      if (!text) throw new Error(`${model} returned an empty response`);
      return { data: JSON.parse(text) as T, model };
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) break;
      console.warn(`Gemini ${model} unavailable, trying the next model:`, (err as Error).message?.slice(0, 160));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini call failed");
}
