import type { ClusterId } from "./clusters";
import postcardImages from "./postcard-images.json";

/**
 * "It feels like…" postcards: how someone says what a song makes them feel. A shared deck, so two
 * people who both feel their (different) songs as "an open window" connect on exactly that. Each
 * card is a drawn image + a short metaphor, and carries a precise feeling word and the listening
 * reason (cluster) it expresses. A pick stores card ids in song_picks.tags and the reasons in
 * tag_whys; per song, Gemini orders the deck so the best-fitting cards come first
 * (lib/matching/songPostcards.ts). Older picks may still carry the original fixed tags (lib/tags.ts).
 *
 * Images come from Unsplash via scripts/curate-postcards.ts into lib/postcard-images.json (hotlinked
 * and credited, per Unsplash's API guidelines). A card without one shows a drawn placeholder.
 */

export type PostcardId = (typeof POSTCARDS)[number]["id"];

export type Postcard = {
  id: string;
  /** What's on the card: "an open window". */
  phrase: string;
  /** The precise feeling underneath: "relief". */
  feeling: string;
  why: ClusterId;
  /** Unsplash search terms for scripts/curate-postcards.ts. */
  query: string;
};

export type PostcardImage = {
  /** Unsplash image URL (hotlinked, sized with Unsplash's URL params). */
  url: string;
  /** Tiny version for loading. */
  thumb: string;
  artist: string;
  artistUrl: string;
  unsplashUrl: string;
};

export const POSTCARDS = [
  // Quiet company: when it's too quiet at home.
  { id: "a-hug", phrase: "a hug", feeling: "comforted", why: "quiet_company", query: "hug illustration" },
  { id: "lamp-in-the-dark", phrase: "a lamp in a dark room", feeling: "safe", why: "quiet_company", query: "lamp dark room illustration" },
  { id: "lit-window-at-night", phrase: "a lit window at night", feeling: "less alone", why: "quiet_company", query: "lit window night illustration" },
  { id: "slow-exhale", phrase: "a slow exhale", feeling: "released", why: "quiet_company", query: "calm breathing illustration" },
  { id: "warm-cup", phrase: "a warm cup in cold hands", feeling: "soothed", why: "quiet_company", query: "hands holding warm mug illustration" },
  { id: "blanket-fort", phrase: "a blanket fort", feeling: "sheltered", why: "quiet_company", query: "cozy blanket illustration" },
  // Carrying loss: songs for someone I miss.
  { id: "a-bruise", phrase: "a bruise", feeling: "aching", why: "carrying_loss", query: "bruised heart illustration" },
  { id: "empty-chair", phrase: "an empty chair", feeling: "missing someone", why: "carrying_loss", query: "empty chair illustration" },
  { id: "unsent-letter", phrase: "a letter never sent", feeling: "unsaid", why: "carrying_loss", query: "letter envelope illustration" },
  { id: "rain-on-glass", phrase: "rain on the window", feeling: "grieving", why: "carrying_loss", query: "rain window illustration" },
  { id: "fading-photo", phrase: "a fading photo", feeling: "slipping away", why: "carrying_loss", query: "old faded photograph illustration" },
  { id: "standing-in-rain", phrase: "standing in the rain", feeling: "heartbroken", why: "carrying_loss", query: "person standing in rain illustration" },
  // Armor up: armor for hard days.
  { id: "driving-too-fast", phrase: "driving too fast", feeling: "reckless", why: "armor_up", query: "car speeding night illustration" },
  { id: "clenched-fist", phrase: "a clenched fist", feeling: "defiant", why: "armor_up", query: "raised fist illustration" },
  { id: "suit-of-armor", phrase: "a suit of armor", feeling: "protected", why: "armor_up", query: "knight armor illustration" },
  { id: "into-the-storm", phrase: "walking into a storm", feeling: "fearless", why: "armor_up", query: "storm lightning illustration" },
  { id: "lit-match", phrase: "a lit match", feeling: "fierce", why: "armor_up", query: "match flame illustration" },
  { id: "mountain-summit", phrase: "a mountain summit", feeling: "unstoppable", why: "armor_up", query: "mountain peak illustration" },
  // Somewhere else: when I need to disappear for a bit.
  { id: "open-window", phrase: "an open window", feeling: "relief", why: "somewhere_else", query: "open window breeze illustration" },
  { id: "floating-in-space", phrase: "floating in space", feeling: "weightless", why: "somewhere_else", query: "astronaut floating space illustration" },
  { id: "door-to-elsewhere", phrase: "a door to another world", feeling: "escape", why: "somewhere_else", query: "magical door illustration" },
  { id: "paper-boat", phrase: "a paper boat drifting", feeling: "carried away", why: "somewhere_else", query: "paper boat water illustration" },
  { id: "above-the-clouds", phrase: "above the clouds", feeling: "free", why: "somewhere_else", query: "above clouds sky illustration" },
  { id: "secret-garden", phrase: "a secret garden", feeling: "hidden", why: "somewhere_else", query: "secret garden illustration" },
  // Old selves: who I used to be.
  { id: "coming-home", phrase: "coming home", feeling: "homesick", why: "old_selves", query: "house home illustration" },
  { id: "old-polaroid", phrase: "an old polaroid", feeling: "nostalgic", why: "old_selves", query: "polaroid photo illustration" },
  { id: "childhood-bedroom", phrase: "a childhood bedroom", feeling: "young again", why: "old_selves", query: "kids bedroom illustration" },
  { id: "last-day-of-summer", phrase: "the last day of summer", feeling: "bittersweet", why: "old_selves", query: "summer sunset illustration" },
  { id: "a-mixtape", phrase: "a mixtape", feeling: "remembering", why: "old_selves", query: "cassette tape illustration" },
  { id: "old-playground", phrase: "an old playground", feeling: "wistful", why: "old_selves", query: "playground swing illustration" },
] as const satisfies readonly Postcard[];

const byId = new Map<string, Postcard>(POSTCARDS.map((p) => [p.id, p]));
const images = postcardImages as Record<string, PostcardImage | undefined>;

export const POSTCARD_IDS = POSTCARDS.map((p) => p.id) as readonly string[];

export function postcardById(id: string): Postcard | undefined {
  return byId.get(id);
}

export function isPostcardId(id: string): id is PostcardId {
  return byId.has(id);
}

export function postcardImage(id: string): PostcardImage | undefined {
  return images[id];
}

/** How many cards show before "more" (the ones Gemini ranked best for the song). */
export const POSTCARDS_SHOWN = 8;

/** The deck interleaved across the five reasons: the order when there's no song-specific one. */
export const DEFAULT_POSTCARD_ORDER: string[] = Array.from({ length: 6 }, (_, i) => POSTCARDS.filter((_, j) => j % 6 === i).map((p) => p.id)).flat();

/** What a person sees for one of a pick's tags: the card's phrase, or an older tag as is. */
export function feelingLabel(tag: string): string {
  return byId.get(tag)?.phrase ?? tag;
}

/**
 * A pick's tags in words for Gemini: "feels like an open window (relief); feels like a bruise
 * (aching)". Older fixed tags pass through as "mood: late night".
 */
export function describeFeelings(tags: string[]): string {
  if (!tags.length) return "(none)";
  return tags
    .map((t) => {
      const card = byId.get(t);
      return card ? `feels like ${card.phrase} (${card.feeling})` : `mood: ${t}`;
    })
    .join("; ");
}
