import { Type, type Schema } from "@google/genai";
import { POSTCARD_IDS, POSTCARDS, POSTCARDS_SHOWN } from "../postcards";
import { generateJson } from "./json";

const DECK = POSTCARDS.map((p) => `- ${p.id}: "${p.phrase}" (${p.feeling})`).join("\n");

const SYSTEM_INSTRUCTION = `People describe how a song makes them feel by choosing "it feels like…" postcards:
a drawn picture plus a short metaphor and the precise feeling underneath it. Given one song,
choose the ${POSTCARDS_SHOWN} postcards from the deck that its listeners are most likely to reach for,
best fit first.

Think about how the song actually feels to live with (its story, its sound, what people do
with it), not just its lyrics' literal words. Include a spread of the song's honest
feelings, including less obvious ones, so different listeners can find theirs. If you don't
know the song, go by the title and the artist's usual world.

The deck (id: "phrase" (feeling)):
${DECK}

Return only ids from the deck, each once.`;

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    order: { type: Type.ARRAY, items: { type: Type.STRING, enum: [...POSTCARD_IDS] }, minItems: String(POSTCARDS_SHOWN), maxItems: String(POSTCARDS_SHOWN) },
  },
  required: ["order"],
};

/**
 * The postcards that fit one song best, best first (POSTCARDS_SHOWN of them). COMPLIANCE: only the
 * plain title/artist strings reach Gemini (CLAUDE.md "Spotify data can never touch the LLM").
 */
export async function orderPostcards(title: string, artist: string): Promise<{ order: string[]; model: string }> {
  const { data, model } = await generateJson<{ order?: string[] }>({ system: SYSTEM_INSTRUCTION, prompt: `"${title}" by ${artist}`, schema: SCHEMA });
  const order = [...new Set((data.order ?? []).filter((id) => POSTCARD_IDS.includes(id)))];
  if (order.length < POSTCARDS_SHOWN / 2) throw new Error(`Only ${order.length} usable postcards came back for "${title}"`);
  return { order: order.slice(0, POSTCARDS_SHOWN), model };
}
