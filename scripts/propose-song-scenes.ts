/**
 * Direction B, revised-path step 4 (docs/plans/galaxy-communities.md): propose candidate music-scene
 * groupings for the real catalog. This is the "offline proposal step" the plan describes — it PRINTS a
 * proposal for a human to review and publish by hand (via song_scenes/song_scene_memberships, migration
 * 20260927040000); it never writes to the database itself. Nothing here changes what users see.
 *
 * Signal, per the validated result in the plan doc: MusicBrainz genre/tag data is primary (accurate where
 * available); the Gemini title/artist embedding is a lower-confidence fallback used only for songs
 * MusicBrainz couldn't tag, matched to the nearest tag-derived group's centroid.
 *
 *   node --env-file=.env.local --import tsx scripts/propose-song-scenes.ts
 */
import { createServerClient } from "../lib/supabase/server";
import { parseVector } from "../lib/supabase/vector";

const MIN_SCENE_SIZE = 2;
const FALLBACK_SIMILARITY_FLOOR = 0.6;
const MB_REQUEST_INTERVAL_MS = 1000; // MusicBrainz: 1 req/sec

// Generic tags/genres that don't distinguish a scene from any other rock/pop-adjacent song — grouping on
// these would just recreate "everything is rock" as a mega-scene, so they're skipped in favor of a more
// specific tag when one exists.
const GENERIC = new Set(["rock", "pop", "pop/rock", "alternative rock", "indie", "singer-songwriter"]);

type CatalogSong = { id: string; title: string; artist: string; mbid: string | null; embedding: number[] | null };

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

let lastMbRequest = 0;
async function throttleMb() {
  const elapsed = Date.now() - lastMbRequest;
  if (elapsed < MB_REQUEST_INTERVAL_MS) await new Promise((r) => setTimeout(r, MB_REQUEST_INTERVAL_MS - elapsed));
  lastMbRequest = Date.now();
}

const userAgent = () => `SongGalaxy/0.1 (hackgt-meta-track; contact: ${process.env.MUSICBRAINZ_CONTACT_EMAIL})`;

/**
 * Recording-level tags/genres are sparse (community-tagged per track); artist-level genres are far more
 * reliably populated in MusicBrainz. Try the recording first, fall back to its primary artist.
 */
async function fetchGenreTags(mbid: string): Promise<string[]> {
  await throttleMb();
  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/recording/${mbid}?inc=tags+genres+artist-credits&fmt=json`, {
      headers: { "User-Agent": userAgent() },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      genres?: { name: string }[];
      tags?: { name: string }[];
      "artist-credit"?: { artist?: { id: string } }[];
    };
    // Genres (curated taxonomy) before tags (folksonomy) — genres are the cleaner signal.
    const recordingNames = [...(data.genres ?? []).map((g) => g.name), ...(data.tags ?? []).map((t) => t.name)];
    if (recordingNames.length) return recordingNames;

    const artistId = data["artist-credit"]?.[0]?.artist?.id;
    if (!artistId) return [];
    return await fetchArtistGenres(artistId);
  } catch (err) {
    console.warn(`  (MusicBrainz lookup failed for ${mbid}: ${err instanceof Error ? err.message : err})`);
    return [];
  }
}

async function fetchArtistGenres(artistId: string): Promise<string[]> {
  await throttleMb();
  try {
    const res = await fetch(`https://musicbrainz.org/ws/2/artist/${artistId}?inc=genres+tags&fmt=json`, {
      headers: { "User-Agent": userAgent() },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { genres?: { name: string }[]; tags?: { name: string }[] };
    return [...(data.genres ?? []).map((g) => g.name), ...(data.tags ?? []).map((t) => t.name)];
  } catch (err) {
    console.warn(`  (MusicBrainz artist lookup failed for ${artistId}: ${err instanceof Error ? err.message : err})`);
    return [];
  }
}

function pickPrimaryGenre(names: string[]): string | null {
  const specific = names.find((n) => !GENERIC.has(n.toLowerCase()));
  return specific ?? names[0] ?? null;
}

async function main() {
  const supabase = createServerClient();
  const { data, error } = await supabase.from("songs").select("id, title, artist, mbid, embedding");
  if (error) throw new Error(`Failed to load catalog: ${error.message}`);

  const songs: CatalogSong[] = (data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    mbid: s.mbid,
    embedding: s.embedding ? parseVector(s.embedding) : null,
  }));
  console.log(`Catalog: ${songs.length} songs.\n`);

  // Pass 1: tag-derived groups.
  const groups = new Map<string, { source: "musicbrainz_tag"; members: CatalogSong[] }>();
  const untagged: CatalogSong[] = [];
  for (const song of songs) {
    if (!song.mbid) {
      untagged.push(song);
      continue;
    }
    const names = await fetchGenreTags(song.mbid);
    const primary = pickPrimaryGenre(names);
    console.log(`  "${song.title}" by ${song.artist}: ${names.length ? names.join(", ") : "(no tags)"}  -> ${primary ?? "(untagged)"}`);
    if (!primary) {
      untagged.push(song);
      continue;
    }
    const key = primary.toLowerCase();
    if (!groups.has(key)) groups.set(key, { source: "musicbrainz_tag", members: [] });
    groups.get(key)!.members.push(song);
  }

  // Drop groups too small to be a real scene; their songs fall back to embedding assignment too.
  for (const [key, group] of groups) {
    if (group.members.length < MIN_SCENE_SIZE) {
      untagged.push(...group.members);
      groups.delete(key);
    }
  }

  // Pass 2: embedding-fallback assignment for anything without a usable tag, matched against each
  // tag-derived group's centroid (mean embedding of its tagged members).
  const centroids = new Map<string, number[]>();
  for (const [key, group] of groups) {
    const withEmbedding = group.members.filter((m) => m.embedding);
    if (!withEmbedding.length) continue;
    const dim = withEmbedding[0].embedding!.length;
    const centroid = new Array(dim).fill(0);
    for (const m of withEmbedding) for (let i = 0; i < dim; i++) centroid[i] += m.embedding![i] / withEmbedding.length;
    centroids.set(key, centroid);
  }

  const fallbackAssigned: { song: CatalogSong; key: string; similarity: number }[] = [];
  const unclustered: CatalogSong[] = [];
  for (const song of untagged) {
    if (!song.embedding) {
      unclustered.push(song);
      continue;
    }
    let best: { key: string; sim: number } | null = null;
    for (const [key, centroid] of centroids) {
      const sim = cosine(song.embedding, centroid);
      if (!best || sim > best.sim) best = { key, sim };
    }
    if (best && best.sim >= FALLBACK_SIMILARITY_FLOOR) {
      fallbackAssigned.push({ song, key: best.key, similarity: best.sim });
    } else {
      unclustered.push(song);
    }
  }

  console.log("\n" + "=".repeat(100));
  console.log("PROPOSAL — review by hand before publishing any of this to song_scenes / song_scene_memberships");
  console.log("=".repeat(100));
  for (const [key, group] of groups) {
    const fallback = fallbackAssigned.filter((f) => f.key === key);
    console.log(`\nScene candidate: "${key}"  (${group.members.length} tagged + ${fallback.length} embedding-fallback)`);
    for (const m of group.members) console.log(`  [musicbrainz_tag]     "${m.title}" by ${m.artist}`);
    for (const f of fallback) console.log(`  [embedding_fallback]  "${f.song.title}" by ${f.song.artist}  (similarity ${f.similarity.toFixed(3)})`);
  }
  console.log(`\nUnclustered (${unclustered.length}) — no usable tag and no confident embedding match:`);
  for (const s of unclustered) console.log(`  "${s.title}" by ${s.artist}`);

  console.log("\n" + "=".repeat(100));
  console.log(`${groups.size} scene candidate(s) proposed. Target for the first published set: 6-8 (per the plan).`);
  console.log("Next: a human reviews these groupings, writes/edits the label + description per scene, and");
  console.log("publishes the approved ones via song_scenes/song_scene_memberships. This script writes nothing.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
