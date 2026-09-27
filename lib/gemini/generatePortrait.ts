import { Type, type Schema } from "@google/genai";
import type { Portrait } from "../portrait";
import { generateJson } from "./json";

/** A live topic_clusters row, as the portrait naming call needs it (never baked in — see below). */
export type PortraitCluster = { id: string; label: string; description: string };

/** One public pick, as the portrait sees it. Plain strings only — never a Spotify payload (CLAUDE.md). */
export type PortraitPick = {
  title: string;
  artist: string;
  /** songs.context_summary: Gemini's one-line description of the song itself. */
  contextSummary: string | null;
  tags: string[];
  valence: number;
  energy: number;
  reasonText: string | null;
};

function systemInstruction(clusters: PortraitCluster[]) {
  const clusterGuide = clusters.map((c) => `- ${c.id}: "${c.label}" — ${c.description}`).join("\n");
  return `You read how one person uses music, from the songs they chose to share and
how they described each one: mood tags they picked, and a point they placed on a
circle (valence = sad to happy, energy = calm to intense, each -1 to 1). Some picks
include a line in their own words. Each song also has a one-line description of the
song itself. Write a short "listening portrait" of them, spoken to them directly ("you").

What makes a portrait good:
- Specific to THIS person. Every observation must rest on their actual picks, and
  cite them by exact title. If two different people could have received it, rewrite it.
- About how they USE music (when they reach for it, what it does for them), not a
  review of their taste or a list of genres.
- Warm and plain. No flattery, no horoscope vagueness, no therapy-speak.

Hard rules:
- Never diagnose or use clinical or mental-health language. Never guess at their
  life story. A "grief" or "heartbreak" tag means they use music to stay with loss —
  do not invent who or what they lost.
- Handle heavy themes gently and briefly; never dramatize them.
- Describe feelings in words; never mention the numbers.
- Only use song titles from their list, spelled exactly as given. Never invent songs,
  artists, or facts about them.

Motivation clusters (each motivation must use one of these ids):
${clusterGuide}

Fields:
- headline: one sentence, at most 16 words, that captures how they use music.
- highlights: exactly 3 short observations (at most 14 words each), each about a
  different song or pattern; these appear one at a time on screen.
- motivations: 2 to 4, strongest first. label: at most 6 words, in their terms.
  description: one or two sentences. confidence: 0 to 1, higher when more picks
  support it. evidence: 1 to 3 items, each a short line citing songTitles from their list.
- seeks: one sentence on the kind of listener they'd genuinely connect with (shared
  reasons, not shared taste). This is not shown to them.
- tensions: one sentence only if two of their uses of music pull against each other;
  otherwise an empty string.`;
}

function schemaFor(clusters: PortraitCluster[]): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      headline: { type: Type.STRING },
      highlights: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: "3", maxItems: "3" },
      motivations: {
        type: Type.ARRAY,
        minItems: "1",
        maxItems: "4",
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING },
            description: { type: Type.STRING },
            cluster: { type: Type.STRING, enum: clusters.map((c) => c.id) },
            confidence: { type: Type.NUMBER },
            evidence: {
              type: Type.ARRAY,
              minItems: "1",
              maxItems: "3",
              items: {
                type: Type.OBJECT,
                properties: { text: { type: Type.STRING }, songTitles: { type: Type.ARRAY, items: { type: Type.STRING } } },
                required: ["text", "songTitles"],
              },
            },
          },
          required: ["label", "description", "cluster", "confidence", "evidence"],
          propertyOrdering: ["label", "description", "cluster", "confidence", "evidence"],
        },
      },
      seeks: { type: Type.STRING },
      tensions: { type: Type.STRING },
    },
    required: ["headline", "highlights", "motivations", "seeks", "tensions"],
    propertyOrdering: ["headline", "highlights", "motivations", "seeks", "tensions"],
  };
}

function describePick(p: PortraitPick) {
  const lines = [`- "${p.title}" by ${p.artist}`];
  if (p.contextSummary) lines.push(`  about the song: ${p.contextSummary}`);
  lines.push(`  their tags: ${p.tags.join(", ") || "(none)"}; valence ${p.valence.toFixed(2)}, energy ${p.energy.toFixed(2)}`);
  if (p.reasonText) lines.push(`  in their words: "${p.reasonText}"`);
  return lines.join("\n");
}

const loose = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Keep only what the picks can back up: real titles, known clusters, sane confidence. */
function sanitize(raw: Portrait, picks: PortraitPick[], clusters: PortraitCluster[]): Portrait {
  const clusterIds = new Set(clusters.map((c) => c.id));
  const titleOf = new Map(picks.map((p) => [loose(p.title), p.title]));
  const realTitles = (titles: string[]) => [...new Set(titles.map((t) => titleOf.get(loose(t))).filter((t): t is string => !!t))];

  const motivations = (raw.motivations ?? [])
    .filter((m) => clusterIds.has(m.cluster) && m.label?.trim())
    .map((m) => ({
      label: m.label.trim(),
      description: m.description.trim(),
      cluster: m.cluster,
      confidence: Math.max(0, Math.min(1, Number(m.confidence) || 0)),
      evidence: (m.evidence ?? []).map((e) => ({ text: e.text.trim(), songTitles: realTitles(e.songTitles ?? []) })).filter((e) => e.text),
    }))
    .filter((m) => m.evidence.some((e) => e.songTitles.length > 0));

  if (!raw.headline?.trim() || motivations.length === 0) {
    throw new Error("Portrait came back without a headline or any grounded motivation");
  }

  return {
    headline: raw.headline.trim(),
    highlights: (raw.highlights ?? []).map((h) => h.trim()).filter(Boolean).slice(0, 3),
    motivations,
    seeks: raw.seeks?.trim() ?? "",
    ...(raw.tensions?.trim() ? { tensions: raw.tensions.trim() } : {}),
  };
}

/**
 * Gemini's reading of one person's public picks: how they use music, grounded in the songs they
 * chose. Shown back to them on the why / me screens, and used server-side (never shown to others)
 * when assessing their connections.
 *
 * `clusters` is the live, non-superseded `topic_clusters` set at generation time (the caller loads
 * it — this module has no DB access), not a baked-in enum: the set changes as
 * scripts/recompute-topic-clusters.ts runs, so a motivation's `cluster` id is only ever one that
 * was live the moment this portrait was written. A cluster retired after that (superseded_by set)
 * is resolved to its successor lazily wherever the portrait is read (lib/clusters.ts), not by
 * regenerating the portrait — cheaper, and consistent with portraits regenerating on pick changes,
 * not cluster changes.
 */
export async function generatePortrait(picks: PortraitPick[], clusters: PortraitCluster[]): Promise<{ portrait: Portrait; model: string }> {
  if (picks.length === 0) throw new Error("generatePortrait needs at least one pick");
  if (clusters.length === 0) throw new Error("generatePortrait needs at least one live topic cluster");
  const prompt = `Their songs (${picks.length}):\n${picks.map(describePick).join("\n")}`;
  const { data, model } = await generateJson<Portrait>({ system: systemInstruction(clusters), prompt, schema: schemaFor(clusters) });
  return { portrait: sanitize(data, picks, clusters), model };
}
