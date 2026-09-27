import { Type, type Schema } from "@google/genai";
import { CLUSTERS, CLUSTER_IDS, type ClusterId } from "../clusters";
import type { SongTag } from "../tags";
import { generateJson } from "./json";

const CLUSTER_GUIDE = CLUSTER_IDS.map((id) => `- ${id}: "${CLUSTERS[id].label}" — ${CLUSTERS[id].description}`).join("\n");

const SYSTEM_INSTRUCTION = `You write the tags people choose from to say what one specific song is for them.
Given a song title and artist, write 6 tags.

Each tag:
- 1 or 2 words. Never more than 2. Lowercase, no punctuation, no emoji. People glance
  at these, they don't read them: think "frozen roads", "feeling small", "parents
  aging", "taxi spiral", not a phrase or a sentence.
- Specific to THIS song: its story, images, moment or feeling as people actually live
  it. Someone who knows the song should recognize it; it should not fit most songs.
- About the listener's moment or feeling ("coming home", "her street", "faking fine"),
  not a review of the sound ("gentle guitar", "great beat", "soft vocals").
- Never generic moods or situations: not "late night", "sad", "chill", "happy",
  "workout", "study", "vibes", "nostalgia", "heartbreak", "road trip", "love song".
- Never the song title, the artist, the genre, or the era.
- Six distinct angles on the song, not six rewordings of one.

For each tag, give "why": the one listening reason it expresses most:
${CLUSTER_GUIDE}
Use several different reasons across the six when the song honestly supports them.

If you don't know the song, write tags from what the title suggests and the artist's
usual world, and keep them a little broader. Never invent lyrics or facts.`;

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    tags: {
      type: Type.ARRAY,
      minItems: "5",
      maxItems: "6",
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          why: { type: Type.STRING, enum: [...CLUSTER_IDS] },
        },
        required: ["label", "why"],
        propertyOrdering: ["label", "why"],
      },
    },
  },
  required: ["tags"],
};

const BANNED = new Set(["late night", "sad", "chill", "happy", "workout", "study", "vibes", "nostalgia", "heartbreak", "road trip", "love song"]);

/** Tidy and check what came back: short, lowercase, distinct, a real cluster, not a banned generic. */
function sanitize(raw: { tags?: { label?: string; why?: string }[] }, title: string, artist: string): SongTag[] {
  const seen = new Set<string>();
  const titleLower = title.toLowerCase();
  const artistLower = artist.toLowerCase();
  const out: SongTag[] = [];
  for (const t of raw.tags ?? []) {
    const label = (t.label ?? "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}' ]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    const words = label.split(" ").filter(Boolean).length;
    if (!label || words < 1 || words > 2 || label.length > 20) continue;
    if (BANNED.has(label) || label === titleLower || label === artistLower || seen.has(label)) continue;
    if (!(CLUSTER_IDS as readonly string[]).includes(t.why ?? "")) continue;
    seen.add(label);
    out.push({ label, why: t.why as ClusterId });
  }
  return out.slice(0, 6);
}

/**
 * Six short tags written for one song, each tied to a listening reason. COMPLIANCE: only the plain
 * title/artist strings reach Gemini (CLAUDE.md "Spotify data can never touch the LLM").
 */
export async function generateSongTags(title: string, artist: string): Promise<{ tags: SongTag[]; model: string }> {
  const { data, model } = await generateJson<{ tags?: { label?: string; why?: string }[] }>({
    system: SYSTEM_INSTRUCTION,
    prompt: `"${title}" by ${artist}`,
    schema: SCHEMA,
  });
  const tags = sanitize(data, title, artist);
  if (tags.length < 4) throw new Error(`Only ${tags.length} usable tags came back for "${title}"`);
  return { tags, model };
}
