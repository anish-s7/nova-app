/**
 * Offline: embeds the mock song catalog with the same model the real pipeline uses
 * (gemini-embedding-001, plain "<title>" by <artist> strings only, so no Spotify data)
 * and writes lib/sim/song-vectors.json for the /sim demo. Run once, commit the output:
 *
 *   npx tsx --env-file=.env.local scripts/build-sim-embeddings.ts
 *
 * Vectors are truncated to DIMS (Matryoshka), centered on the catalog mean and re-normalized.
 * Raw Gemini embeddings of short strings are all fairly similar to each other; centering
 * spreads cosine similarity across the full range so "same mood" and "different mood" read differently.
 */
import { writeFileSync } from "node:fs";
import { getGeminiClient, GEMINI_EMBEDDING_MODEL } from "../lib/gemini/client";
import { SONG_CATALOG } from "../lib/music/music-context";

const DIMS = 128;

async function main() {
  const ai = getGeminiClient();
  const labels = SONG_CATALOG.map((s) => `"${s.title}" by ${s.artist}`);
  const raw: number[][] = [];
  for (let i = 0; i < labels.length; i += 50) {
    const res = await ai.models.embedContent({ model: GEMINI_EMBEDDING_MODEL, contents: labels.slice(i, i + 50), config: { outputDimensionality: DIMS } });
    for (const e of res.embeddings ?? []) raw.push(e.values ?? []);
  }
  if (raw.length !== labels.length || raw.some((v) => v.length !== DIMS)) throw new Error(`Expected ${labels.length} x ${DIMS}, got ${raw.length}`);

  const mean = Array.from({ length: DIMS }, (_, d) => raw.reduce((s, v) => s + v[d], 0) / raw.length);
  const vectors = raw.map((v) => {
    const c = v.map((x, d) => x - mean[d]);
    const n = Math.hypot(...c) || 1;
    return c.map((x) => Math.round((x / n) * 1e4) / 1e4);
  });

  writeFileSync(new URL("../lib/sim/song-vectors.json", import.meta.url), JSON.stringify({ model: GEMINI_EMBEDDING_MODEL, dims: DIMS, ids: SONG_CATALOG.map((s) => s.id), vectors }));
  console.log(`Wrote ${vectors.length} vectors x ${DIMS} dims`);
}

main();
