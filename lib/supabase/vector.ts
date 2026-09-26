/**
 * Postgres/PostgREST returns pgvector `vector` columns as their text
 * representation ("[0.1,0.2,...]"), not a parsed JSON array — even though
 * our Insert types accept (and correctly write) a real number[]. This only
 * surfaces on reads that do array math on the result (building a pick's
 * embedding from a song's, cosine similarity), so it never showed up in
 * typecheck/build; confirmed via a live run against a real project on
 * 2026-09-26. Postgres's vector text format happens to be valid JSON, so
 * parsing is trivial — always run reads through this before treating an
 * embedding as a number[].
 */
export function parseVector(value: unknown): number[] {
  if (Array.isArray(value)) return value as number[];
  if (typeof value === "string") return JSON.parse(value) as number[];
  throw new Error(`Unexpected vector value from Postgres: ${JSON.stringify(value)}`);
}
