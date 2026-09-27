import { Type, type Schema } from "@google/genai";
import { generateJson } from "./json";

/** One real member's pick, as the naming call sees it. Plain strings only — never a Spotify payload (CLAUDE.md). */
export type TopicClusterSamplePick = { title: string; artist: string; tags: string[] };

export type TopicClusterName = { label: string; short: string; description: string };

const SYSTEM_INSTRUCTION = `You name a cluster of people on a music-based social app, grouped by an
algorithm on what their picked songs mean — not by genre, and not decided by you. You're given a
sample of real picks from people who landed in this cluster: song, artist, and the mood/context
tags whoever picked it chose. Write a short, warm, specific name for what seems to bring these
picks together: when someone reaches for a song like this, what's going on for them?

Hard rules:
- Base it only on the pattern in the sample; don't invent a backstory or guess at anyone's life.
- Never diagnose or use clinical or mental-health language.
- You are naming a group, not deciding who belongs in it — never comment on membership.
- label: a short phrase in the person's own voice, at most 8 words (e.g. "When it's too quiet at home").
- short: 1-3 words for compact UI (e.g. "Too quiet").
- description: one sentence, spoken to the person directly ("you"), describing when or why they reach for a song like this.`;

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    label: { type: Type.STRING },
    short: { type: Type.STRING },
    description: { type: Type.STRING },
  },
  required: ["label", "short", "description"],
  propertyOrdering: ["label", "short", "description"],
};

function describeSample(p: TopicClusterSamplePick) {
  return `- "${p.title}" by ${p.artist} — tags: ${p.tags.join(", ") || "(none)"}`;
}

/**
 * Names a topic cluster from a sample of real member picks. Never given embeddings or full
 * profiles, and never asked to decide who's in the cluster — naming only, membership is HDBSCAN's
 * job (lib/matching/hdbscan.ts), run before this is ever called.
 */
export async function nameTopicCluster(samplePicks: TopicClusterSamplePick[]): Promise<{ name: TopicClusterName; model: string }> {
  if (samplePicks.length === 0) throw new Error("nameTopicCluster needs at least one sample pick");
  const prompt = `Sample picks from this cluster (${samplePicks.length}):\n${samplePicks.map(describeSample).join("\n")}`;
  const { data, model } = await generateJson<TopicClusterName>({ system: SYSTEM_INSTRUCTION, prompt, schema: SCHEMA });
  return {
    name: { label: data.label.trim(), short: data.short.trim(), description: data.description.trim() },
    model,
  };
}
