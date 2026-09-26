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
//
// gemini-2.5-flash was retired for new callers (confirmed via a live 404
// from the real API on 2026-09-26), and gemini-flash-latest was returning
// 503 (high demand) at the time this was set. Using the "lite" alias
// instead of a pinned version so this doesn't go stale again, and because
// this task (mood description, evidence-check) doesn't need full Flash.
export const GEMINI_TEXT_MODEL = "gemini-flash-lite-latest";

export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

// gemini-embedding-001 defaults to 3072 dims; confirmed via a live call on
// 2026-09-26 (docs/schema everywhere assumed 768 without ever verifying).
// Request 768 explicitly via outputDimensionality (Matryoshka truncation,
// supported on this model) so it matches songs.embedding/song_picks.embedding
// in db/contract.md and the migration — don't change this without also
// changing the DB column widths.
export const EMBEDDING_DIMENSIONS = 768;
