import { generateSongContext } from "../lib/gemini/generateSongContext";
import { evaluateAndGenerateCard } from "../lib/gemini/evaluateAndGenerateCard";

async function main() {
  console.log("1) Testing song context + embedding...");

  const context = await generateSongContext("Holocene", "Bon Iver");

  console.log("Context summary:", context.contextSummary);
  console.log("Embedding dimensions:", context.embedding.length);
  console.log("First 5 values:", context.embedding.slice(0, 5));

  console.log("\n2) Testing match evaluation + connection card...");

  const result = await evaluateAndGenerateCard(
    {
      displayName: "bao-test-a",
      title: "Holocene",
      artist: "Bon Iver",
      tags: ["reflective", "lonely", "calm"],
      valence: -0.4,
      energy: -0.3,
      reasonText: "It makes quiet evenings feel less lonely.",
    },
    {
      displayName: "bao-test-b",
      title: "Fix You",
      artist: "Coldplay",
      tags: ["comforting", "sad", "hopeful"],
      valence: -0.2,
      energy: 0.1,
      reasonText: "I listen to this when I feel sad and need comfort.",
    },
  );

  console.log(JSON.stringify(result, null, 2));

  console.log("\n✅ Gemini integration test completed");
}

main().catch((error) => {
  console.error("\n❌ Gemini integration test failed");
  console.error(error);
  process.exit(1);
});
