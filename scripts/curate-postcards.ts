/**
 * Picks the drawn illustration for each "it feels like…" postcard (lib/postcards.ts) from Unsplash.
 * Two steps, with a human (or Claude) choosing in between:
 *
 *   1. Candidates: searches Unsplash for each card (its `query`) and writes the free (non-Unsplash+)
 *      results, with small preview URLs, to scripts/.postcard-candidates.json (gitignored).
 *        node --env-file=.env.local node_modules/.bin/tsx scripts/curate-postcards.ts candidates [card-id…]
 *   2. Apply: reads { "<card id>": "<unsplash photo id>" } from a file, fetches each photo, registers
 *      the download with Unsplash (required by their API guidelines when an image is used), and
 *      writes lib/postcard-images.json (hotlinked URL + artist credit).
 *        node --env-file=.env.local node_modules/.bin/tsx scripts/curate-postcards.ts apply <choices.json>
 *
 * Needs UNSPLASH_ACCESS_KEY in .env.local (unsplash.com/developers → your app → Access Key).
 * Demo-mode apps get 50 requests/hour; one full candidates run is 30.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { POSTCARDS, type PostcardImage } from "../lib/postcards";

const KEY = process.env.UNSPLASH_ACCESS_KEY;
const API = "https://api.unsplash.com";
const IMAGES_FILE = join(__dirname, "../lib/postcard-images.json");
const CANDIDATES_FILE = join(__dirname, ".postcard-candidates.json");
const PER_CARD = 10;

type UnsplashPhoto = {
  id: string;
  description: string | null;
  alt_description: string | null;
  premium?: boolean;
  plus?: boolean;
  urls: { raw: string; small: string; thumb: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
};

async function unsplash<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Client-ID ${KEY}`, "Accept-Version": "v1" } });
  if (!res.ok) throw new Error(`Unsplash ${path} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

async function candidates(onlyIds: string[]) {
  const existing = existsSync(CANDIDATES_FILE) ? (JSON.parse(readFileSync(CANDIDATES_FILE, "utf8")) as Record<string, unknown>) : {};
  const cards = POSTCARDS.filter((c) => !onlyIds.length || onlyIds.includes(c.id));
  for (const card of cards) {
    const q = new URLSearchParams({ query: card.query, per_page: String(PER_CARD), content_filter: "high" });
    const { results } = await unsplash<{ results: UnsplashPhoto[] }>(`/search/photos?${q}`);
    // Unsplash+ images are paid; only free ones may be used.
    const free = results.filter((p) => !p.premium && !p.plus);
    existing[card.id] = free.map((p) => ({ id: p.id, preview: p.urls.small, about: p.alt_description ?? p.description ?? "", artist: p.user.name }));
    console.log(`${card.id}: ${free.length} free of ${results.length}`);
  }
  writeFileSync(CANDIDATES_FILE, JSON.stringify(existing, null, 2));
  console.log(`\nWrote ${CANDIDATES_FILE}`);
}

async function apply(choicesFile: string) {
  const choices = JSON.parse(readFileSync(choicesFile, "utf8")) as Record<string, string>;
  const images = JSON.parse(readFileSync(IMAGES_FILE, "utf8")) as Record<string, PostcardImage>;
  for (const [cardId, photoId] of Object.entries(choices)) {
    if (!POSTCARDS.some((c) => c.id === cardId)) throw new Error(`Unknown card ${cardId}`);
    const photo = await unsplash<UnsplashPhoto>(`/photos/${photoId}`);
    if (photo.premium || photo.plus) throw new Error(`${photoId} is Unsplash+ (paid); choose another for ${cardId}`);
    // Required by Unsplash's API guidelines when a photo is used in an app.
    await unsplash(`/photos/${photoId}/download`);
    images[cardId] = {
      url: `${photo.urls.raw}&w=600&h=400&fit=crop&auto=format&q=70`,
      thumb: `${photo.urls.raw}&w=60&h=40&fit=crop&auto=format&q=40`,
      artist: photo.user.name,
      artistUrl: photo.user.links.html,
      unsplashUrl: photo.links.html,
    };
    console.log(`${cardId}: ${photo.user.name}`);
  }
  writeFileSync(IMAGES_FILE, `${JSON.stringify(images, null, 2)}\n`);
  console.log(`\nWrote ${IMAGES_FILE} (${Object.keys(images).length}/${POSTCARDS.length} cards have images)`);
}

async function main() {
  if (!KEY) throw new Error("Set UNSPLASH_ACCESS_KEY in .env.local (unsplash.com/developers → your app → Access Key).");
  const [mode, ...args] = process.argv.slice(2);
  if (mode === "candidates") await candidates(args);
  else if (mode === "apply" && args[0]) await apply(args[0]);
  else throw new Error("Usage: curate-postcards.ts candidates [card-id…] | apply <choices.json>");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
