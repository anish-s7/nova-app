import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

/** Server-only. Never expose GEMINI_API_KEY to the client bundle. */
export function getGeminiClient() {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY in .env.local");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

// Flash, not Pro — this is extraction/matching, not a task that needs
// frontier reasoning, and it keeps hackathon API costs down.
export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";
