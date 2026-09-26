/**
 * One-off script: seeds the live Supabase project with a handful of the
 * mock-world.ts personas, run through the REAL MusicBrainz + Gemini
 * pipeline (the same modules app/api/picks/route.ts uses) instead of
 * fabricated vectors. Not a route, not part of the app — run manually:
 *
 *   npx tsx scripts/seed-real-data.ts
 *
 * Safe to re-run: song lookups dedupe by fallback_key/mbid, and profile
 * creation is skipped if the email already has an auth user.
 */
import { createServerClient } from "../lib/supabase/server";
import { resolveSong } from "../lib/musicbrainz/client";
import { generateSongContext } from "../lib/gemini/generateSongContext";
import { clampEmotionValue } from "../lib/emotion";
import { buildPickEmbedding } from "../lib/matching/pickEmbedding";
import { parseVector } from "../lib/supabase/vector";
import { refreshPrimaryCluster } from "../lib/matching/refreshPrimaryCluster";

type Cluster = "quiet_company" | "armor_up" | "carrying_loss" | "somewhere_else" | "old_selves";

// Heuristic stand-in for the real tags/valence/energy onboarding UX, which
// doesn't exist yet (see MERGE_CHECKLIST.md #3). Good enough for demo data,
// not a resolution of that open product decision.
const CLUSTER_PROFILE: Record<Cluster, { tags: string[]; valence: number; energy: number }> = {
  quiet_company: { tags: ["late night", "comfort"], valence: -0.2, energy: -0.6 },
  armor_up: { tags: ["hype / workout"], valence: 0.3, energy: 0.7 },
  carrying_loss: { tags: ["grief", "nostalgia"], valence: -0.7, energy: -0.4 },
  somewhere_else: { tags: ["road trip"], valence: 0.0, energy: 0.1 },
  old_selves: { tags: ["nostalgia"], valence: -0.1, energy: -0.2 },
};

type PersonaSong = { title: string; artist: string; cluster: Cluster };

type Persona = {
  email: string;
  displayName: string;
  songs: PersonaSong[];
};

const PERSONAS: Persona[] = [
  {
    email: "maya@song-galaxy.local",
    displayName: "Maya",
    songs: [{ title: "Holocene", artist: "Bon Iver", cluster: "quiet_company" }],
  },
  {
    email: "theo@song-galaxy.local",
    displayName: "Theo",
    songs: [
      { title: "Weightless", artist: "Marconi Union", cluster: "quiet_company" },
      { title: "Clair de Lune", artist: "Claude Debussy", cluster: "quiet_company" },
      { title: "Intro", artist: "The xx", cluster: "quiet_company" },
      { title: "Gymnopédie No. 1", artist: "Erik Satie", cluster: "somewhere_else" },
      { title: "Heartbeats", artist: "José González", cluster: "somewhere_else" },
    ],
  },
  {
    email: "jordan@song-galaxy.local",
    displayName: "Jordan",
    songs: [
      { title: "Marvins Room", artist: "Drake", cluster: "quiet_company" },
      { title: "Snooze", artist: "SZA", cluster: "quiet_company" },
      { title: "Good News", artist: "Mac Miller", cluster: "quiet_company" },
      { title: "Get You", artist: "Daniel Caesar", cluster: "quiet_company" },
      { title: "Dead Man Walking", artist: "Brent Faiyaz", cluster: "old_selves" },
    ],
  },
  {
    email: "amara@song-galaxy.local",
    displayName: "Amara",
    songs: [
      { title: "Glimpse of Us", artist: "Joji", cluster: "carrying_loss" },
      { title: "Nuvole Bianche", artist: "Ludovico Einaudi", cluster: "carrying_loss" },
      { title: "Bags", artist: "Clairo", cluster: "old_selves" },
      { title: "Tadow", artist: "Masego & FKJ", cluster: "somewhere_else" },
      { title: "Hurt", artist: "Johnny Cash", cluster: "carrying_loss" },
    ],
  },
  {
    email: "noor@song-galaxy.local",
    displayName: "Noor",
    songs: [
      { title: "Lose Yourself", artist: "Eminem", cluster: "armor_up" },
      { title: "HUMBLE.", artist: "Kendrick Lamar", cluster: "armor_up" },
      { title: "Stronger", artist: "Kanye West", cluster: "armor_up" },
      { title: "Eye of the Tiger", artist: "Survivor", cluster: "armor_up" },
      { title: "Run the World (Girls)", artist: "Beyoncé", cluster: "armor_up" },
      // Same song as Sam, opposite feeling: gives wander_picks a real contrast pair.
      { title: "Landslide", artist: "Fleetwood Mac", cluster: "armor_up" },
    ],
  },
  {
    email: "sam@song-galaxy.local",
    displayName: "Sam",
    songs: [
      { title: "Fourth of July", artist: "Sufjan Stevens", cluster: "carrying_loss" },
      { title: "Casimir Pulaski Day", artist: "Sufjan Stevens", cluster: "carrying_loss" },
      { title: "Tears in Heaven", artist: "Eric Clapton", cluster: "carrying_loss" },
      { title: "The Night We Met", artist: "Lord Huron", cluster: "carrying_loss" },
      { title: "Landslide", artist: "Fleetwood Mac", cluster: "quiet_company" },
    ],
  },
];

const DEMO_PASSWORD = "song-galaxy-demo";

// Gemini's free tier caps gemini-flash-lite-latest at 15 requests/minute
// (confirmed via a live 429 on 2026-09-26). This is a seed-script-only
// concern — a real user's interactive traffic won't burst like a seed run
// does — so the pacing lives here, not in lib/gemini/client.ts.
const MIN_GEMINI_INTERVAL_MS = 4500;
let lastGeminiCallAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateSongContextWithBackoff(title: string, artist: string) {
  const elapsed = Date.now() - lastGeminiCallAt;
  if (elapsed < MIN_GEMINI_INTERVAL_MS) {
    await sleep(MIN_GEMINI_INTERVAL_MS - elapsed);
  }

  try {
    const result = await generateSongContext(title, artist);
    lastGeminiCallAt = Date.now();
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryMatch = message.match(/retry in ([\d.]+)s/i);
    if (retryMatch) {
      const retryDelayMs = Math.ceil(parseFloat(retryMatch[1]) * 1000) + 1000;
      console.warn(`  Gemini rate-limited, waiting ${Math.round(retryDelayMs / 1000)}s before retrying...`);
      await sleep(retryDelayMs);
      const result = await generateSongContext(title, artist);
      lastGeminiCallAt = Date.now();
      return result;
    }
    throw err;
  }
}

/**
 * Loose title identity for re-run checks. MusicBrainz canonicalizes titles differently from how
 * they're typed here ("Gymnopedie" vs "Gymnopédie", "HUMBLE" vs "HUMBLE.", "Tadow (edit)" vs
 * "Tadow") and can return a different recording id on a later run, so neither the mbid nor an
 * exact name match reliably finds a pick this script already made.
 */
function looseTitle(title: string) {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function existingPickTitles(supabase: ReturnType<typeof createServerClient>, profileId: string) {
  const { data, error } = await supabase.from("song_picks").select("songs(title)").eq("profile_id", profileId);
  if (error) throw new Error(`Failed to load existing picks: ${error.message}`);
  const rows = (data ?? []) as unknown as { songs: { title: string } | null }[];
  return new Set(rows.flatMap((r) => (r.songs ? [looseTitle(r.songs.title)] : [])));
}

function fallbackKey(title: string, artist: string) {
  return `${title.trim().toLowerCase()}::${artist.trim().toLowerCase()}`;
}

async function ensureProfile(supabase: ReturnType<typeof createServerClient>, email: string, displayName: string) {
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === email);
  if (found) {
    console.log(`  profile exists: ${displayName} (${found.id})`);
    return found.id;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });

  if (error || !data.user) {
    throw new Error(`Failed to create auth user for ${email}: ${error?.message}`);
  }

  console.log(`  created profile: ${displayName} (${data.user.id})`);
  return data.user.id;
}

async function ensureSong(
  supabase: ReturnType<typeof createServerClient>,
  title: string,
  artist: string,
  cache: Map<string, { id: string; embedding: number[] }>
) {
  const key = fallbackKey(title, artist);
  const cached = cache.get(key);
  if (cached) return cached;

  // Song identity: MusicBrainz first, Gemini fallback — same order as
  // app/api/picks/route.ts. See CLAUDE.md's compliance rule.
  let resolution: Awaited<ReturnType<typeof resolveSong>> = null;
  try {
    resolution = await resolveSong(title, artist);
  } catch (err) {
    console.warn(`  MusicBrainz lookup failed for "${title}" by ${artist}, falling back to Gemini:`, err);
  }

  const canonicalTitle = resolution?.title ?? title;
  const canonicalArtist = resolution?.artist ?? artist;

  const existingQuery = resolution
    ? supabase.from("songs").select("id, embedding").eq("mbid", resolution.mbid).maybeSingle()
    : supabase.from("songs").select("id, embedding").eq("fallback_key", key).maybeSingle();

  const { data: primaryMatch } = await existingQuery;

  // Safety net: MusicBrainz is flaky mid-run (confirmed 2026-09-26 —
  // connection resets, likely the placeholder-User-Agent abuse detection
  // before MUSICBRAINZ_CONTACT_EMAIL was set). Without this, a song
  // resolved via MusicBrainz on one call and falling back to Gemini on a
  // retry (or vice versa) looks up the wrong key and creates a duplicate
  // catalog row instead of finding the one that already exists.
  const { data: nameMatch } = primaryMatch
    ? { data: null }
    : await supabase.from("songs").select("id, embedding").ilike("title", title).ilike("artist", artist).maybeSingle();

  const existingSong = primaryMatch ?? nameMatch;
  if (existingSong?.embedding) {
    const result = { id: existingSong.id, embedding: parseVector(existingSong.embedding) };
    cache.set(key, result);
    return result;
  }

  console.log(`  resolving "${canonicalTitle}" by ${canonicalArtist} (${resolution ? "musicbrainz" : "gemini_fallback"})...`);
  const { contextSummary, embedding } = await generateSongContextWithBackoff(canonicalTitle, canonicalArtist);

  const { data: inserted, error } = await supabase
    .from("songs")
    .insert({
      title: canonicalTitle,
      artist: canonicalArtist,
      mbid: resolution?.mbid ?? null,
      fallback_key: resolution ? null : key,
      resolution_source: resolution ? "musicbrainz" : "gemini_fallback",
      context_summary: contextSummary,
      embedding,
    })
    .select("id, embedding")
    .single();

  if (error || !inserted) {
    throw new Error(`Failed to insert song "${canonicalTitle}": ${error?.message}`);
  }

  const result = { id: inserted.id, embedding: parseVector(inserted.embedding) };
  cache.set(key, result);
  return result;
}

async function main() {
  const supabase = createServerClient();
  const songCache = new Map<string, { id: string; embedding: number[] }>();

  for (const persona of PERSONAS) {
    console.log(`\n${persona.displayName} (${persona.email})`);
    const profileId = await ensureProfile(supabase, persona.email, persona.displayName);

    // song_picks has no (profile_id, song_id) unique constraint, so re-runs must check first —
    // and before resolving the song, so a re-run never calls MusicBrainz/Gemini or adds catalog rows.
    const alreadyPicked = await existingPickTitles(supabase, profileId);

    for (const song of persona.songs) {
      if (alreadyPicked.has(looseTitle(song.title))) {
        console.log(`  pick exists: "${song.title}"`);
        continue;
      }

      const { id: songId, embedding: songEmbedding } = await ensureSong(supabase, song.title, song.artist, songCache);

      const profile = CLUSTER_PROFILE[song.cluster];
      const valence = clampEmotionValue(profile.valence);
      const energy = clampEmotionValue(profile.energy);
      const pickEmbedding = buildPickEmbedding(songEmbedding, valence, energy);

      const { error } = await supabase.from("song_picks").insert({
        profile_id: profileId,
        song_id: songId,
        tags: profile.tags,
        valence,
        energy,
        embedding: pickEmbedding,
        is_public: true,
      });

      if (error) {
        throw new Error(`Failed to insert pick "${song.title}" for ${persona.displayName}: ${error.message}`);
      }
      console.log(`  pick: "${song.title}" by ${song.artist} [${profile.tags.join(", ")}]`);
    }

    const cluster = await refreshPrimaryCluster(supabase, profileId);
    console.log(`  primary_cluster: ${cluster ?? "(none)"}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
