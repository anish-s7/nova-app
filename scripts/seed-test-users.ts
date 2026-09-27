/**
 * Seeds ~100 clearly fictional test users through the real pipeline, so the galaxy, clusters and
 * matching can be seen at a realistic size. Each test user leans toward one or two listening
 * reasons, picks 4–7 songs from a hand-built pool of well-known songs (each with a plausible
 * mood-circle spot and feelings that fit it), with personal variation; a few pairs pick the same
 * song with opposite feelings (Wander). Deterministic (fixed random seed), idempotent (re-running
 * skips existing users/picks), and removable: scripts/remove-test-users.ts deletes every
 * `…@test.song-galaxy.local` account.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/seed-test-users.ts [--count=100]
 *
 * Songs go through MusicBrainz → Gemini context + embedding → cover art, like POST /api/picks
 * (only plain title/artist strings reach Gemini). Every user gets a galaxy group and a portrait.
 * Match cards are NOT pre-generated: they're assessed when someone opens Connections.
 * Password: SEED_DEMO_PASSWORD (same as the demo personas).
 */
import { createServerClient } from "../lib/supabase/server";
import { resolveSong } from "../lib/musicbrainz/client";
import { generateSongContext } from "../lib/gemini/generateSongContext";
import { findCover } from "../lib/cover-art";
import { buildPickEmbedding } from "../lib/matching/pickEmbedding";
import { clampEmotionValue } from "../lib/emotion";
import { refreshPrimaryCluster } from "../lib/matching/refreshPrimaryCluster";
import { upsertPortrait } from "../lib/matching/portraits";
import { parseVector } from "../lib/supabase/vector";
import { isValidTag } from "../lib/tags";
import type { ClusterId } from "../lib/clusters";

export const TEST_DOMAIN = "test.song-galaxy.local";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "";
const COUNT = Number(process.argv.find((a) => a.startsWith("--count="))?.split("=")[1] ?? 100);

// [title, artist, valence, energy, feelings that fit it]
type PoolSong = [string, string, number, number, string];
const POOL: Record<ClusterId, PoolSong[]> = {
  quiet_company: [
    ["Holocene", "Bon Iver", -0.1, -0.6, "weightless,tender,calm"],
    ["Weightless", "Marconi Union", 0.3, -0.85, "calm,safe"],
    ["Clair de Lune", "Claude Debussy", 0.2, -0.7, "tender,calm,nostalgic"],
    ["Pink Moon", "Nick Drake", -0.1, -0.5, "tender,understood,bittersweet"],
    ["Space Song", "Beach House", 0.0, -0.4, "weightless,longing,calm"],
    ["Cherry Wine", "Hozier", -0.2, -0.5, "tender,aching,understood"],
    ["Ivy", "Frank Ocean", -0.1, -0.3, "tender,nostalgic,longing"],
    ["Self Control", "Frank Ocean", -0.3, -0.4, "longing,tender,understood"],
    ["Put Your Records On", "Corinne Bailey Rae", 0.7, -0.1, "safe,hopeful,calm"],
    ["Banana Pancakes", "Jack Johnson", 0.6, -0.4, "safe,calm,tender"],
    ["Apocalypse", "Cigarettes After Sex", -0.1, -0.6, "tender,longing,weightless"],
    ["Bloom", "The Paper Kites", 0.4, -0.5, "tender,safe,hopeful"],
    ["Sunday Morning", "Maroon 5", 0.6, -0.2, "safe,tender"],
    ["Snooze", "SZA", 0.1, -0.3, "tender,longing,safe"],
    ["Intro", "The xx", 0.0, -0.1, "understood,calm,restless"],
    ["Gymnopédie No. 1", "Erik Satie", 0.1, -0.8, "calm,weightless"],
    ["Heartbeats", "José González", 0.1, -0.5, "tender,calm,hopeful"],
    ["The Only Living Boy in New York", "Simon & Garfunkel", 0.0, -0.4, "understood,calm,bittersweet"],
    ["Harvest Moon", "Neil Young", 0.4, -0.5, "tender,safe,nostalgic"],
    ["Lua", "Bright Eyes", -0.4, -0.6, "numb,understood,aching"],
  ],
  carrying_loss: [
    ["Someone Like You", "Adele", -0.7, -0.2, "heartbroken,aching,longing"],
    ["The Night We Met", "Lord Huron", -0.6, -0.3, "longing,homesick,aching"],
    ["Fourth of July", "Sufjan Stevens", -0.8, -0.6, "aching,heartbroken,tender"],
    ["Hurt", "Johnny Cash", -0.8, -0.4, "aching,numb"],
    ["Tears in Heaven", "Eric Clapton", -0.7, -0.4, "aching,longing,tender"],
    ["drivers license", "Olivia Rodrigo", -0.7, 0.2, "heartbroken,aching,restless"],
    ["All Too Well (10 Minute Version) (Taylor's Version)", "Taylor Swift", -0.5, 0.1, "heartbroken,nostalgic,aching"],
    ["Someone You Loved", "Lewis Capaldi", -0.7, 0.0, "heartbroken,longing"],
    ["Jealous", "Labrinth", -0.8, -0.2, "aching,heartbroken,numb"],
    ["Motion Sickness", "Phoebe Bridgers", -0.4, 0.2, "restless,heartbroken,defiant"],
    ["Nothing Compares 2 U", "Sinéad O'Connor", -0.8, -0.1, "heartbroken,longing,aching"],
    ["Hallelujah", "Jeff Buckley", -0.4, -0.4, "aching,tender,understood"],
    ["Fade Into You", "Mazzy Star", -0.3, -0.7, "longing,numb,weightless"],
    ["Glimpse of Us", "Joji", -0.7, -0.3, "longing,heartbroken"],
    ["Say Something", "A Great Big World", -0.8, -0.5, "heartbroken,aching"],
    ["Liability", "Lorde", -0.6, -0.5, "aching,understood,numb"],
    ["Happier Than Ever", "Billie Eilish", -0.4, 0.5, "heartbroken,defiant,restless"],
    ["Casimir Pulaski Day", "Sufjan Stevens", -0.7, -0.5, "heartbroken,numb,tender"],
    ["Marvins Room", "Drake", -0.5, -0.3, "longing,numb"],
    ["Skinny Love", "Bon Iver", -0.6, -0.2, "aching,heartbroken,longing"],
  ],
  armor_up: [
    ["Lose Yourself", "Eminem", 0.0, 0.9, "defiant,fearless,restless"],
    ["HUMBLE.", "Kendrick Lamar", 0.1, 0.85, "defiant,alive"],
    ["Stronger", "Kanye West", 0.4, 0.8, "fearless,alive"],
    ["POWER", "Kanye West", 0.2, 0.8, "defiant,fearless"],
    ["Till I Collapse", "Eminem", 0.0, 0.95, "defiant,restless,fearless"],
    ["Can't Hold Us", "Macklemore & Ryan Lewis", 0.8, 0.9, "alive,euphoric,fearless"],
    ["Believer", "Imagine Dragons", 0.1, 0.85, "defiant,fearless"],
    ["Seven Nation Army", "The White Stripes", 0.0, 0.7, "defiant,restless"],
    ["Killing in the Name", "Rage Against the Machine", -0.4, 1.0, "defiant,restless"],
    ["DNA.", "Kendrick Lamar", 0.0, 0.9, "defiant,alive"],
    ["SICKO MODE", "Travis Scott", 0.3, 0.85, "alive,restless"],
    ["Titanium", "David Guetta", 0.4, 0.7, "fearless,hopeful"],
    ["Run the World (Girls)", "Beyoncé", 0.6, 0.85, "alive,fearless"],
    ["Survivor", "Destiny's Child", 0.4, 0.7, "defiant,fearless"],
    ["Unstoppable", "Sia", 0.5, 0.7, "fearless,hopeful"],
    ["Eye of the Tiger", "Survivor", 0.4, 0.85, "fearless,restless"],
    ["Thunderstruck", "AC/DC", 0.5, 0.95, "alive,restless"],
    ["Mr. Brightside", "The Killers", -0.2, 0.8, "restless,heartbroken,alive"],
    ["bad guy", "Billie Eilish", 0.1, 0.5, "defiant,restless"],
    ["Heads Will Roll", "Yeah Yeah Yeahs", 0.2, 0.9, "alive,restless,euphoric"],
  ],
  somewhere_else: [
    ["Dreams", "Fleetwood Mac", 0.2, 0.0, "weightless,free,bittersweet"],
    ["Midnight City", "M83", 0.6, 0.7, "euphoric,free,young again"],
    ["Tadow", "Masego & FKJ", 0.6, 0.1, "free,hopeful"],
    ["Electric Feel", "MGMT", 0.7, 0.5, "free,euphoric"],
    ["Kids", "MGMT", 0.5, 0.6, "young again,euphoric,nostalgic"],
    ["Levitating", "Dua Lipa", 0.9, 0.7, "euphoric,free"],
    ["Blinding Lights", "The Weeknd", 0.4, 0.8, "restless,euphoric,free"],
    ["Dancing Queen", "ABBA", 0.9, 0.7, "euphoric,young again"],
    ["Mr. Blue Sky", "Electric Light Orchestra", 0.9, 0.6, "hopeful,euphoric"],
    ["Here Comes the Sun", "The Beatles", 0.9, 0.2, "hopeful,free,safe"],
    ["Good Days", "SZA", 0.4, -0.2, "hopeful,weightless,free"],
    ["Sunflower", "Post Malone & Swae Lee", 0.7, 0.3, "free,hopeful"],
    ["Redbone", "Childish Gambino", 0.2, 0.1, "restless,weightless"],
    ["The Less I Know the Better", "Tame Impala", 0.3, 0.5, "free,restless"],
    ["Let It Happen", "Tame Impala", 0.5, 0.6, "weightless,euphoric,free"],
    ["Heat Waves", "Glass Animals", 0.1, 0.4, "longing,weightless,bittersweet"],
    ["Island in the Sun", "Weezer", 0.8, 0.2, "free,safe,young again"],
    ["Riptide", "Vance Joy", 0.7, 0.4, "free,hopeful,young again"],
    ["Somewhere Only We Know", "Keane", 0.2, 0.2, "hopeful,nostalgic,longing"],
    ["Nuvole bianche", "Ludovico Einaudi", 0.0, -0.4, "weightless,aching,calm"],
  ],
  old_selves: [
    ["Landslide", "Fleetwood Mac", -0.2, -0.4, "bittersweet,tender,nostalgic"],
    ["Bags", "Clairo", 0.0, -0.2, "bittersweet,nostalgic,longing"],
    ["Summer of '69", "Bryan Adams", 0.8, 0.7, "young again,nostalgic,alive"],
    ["Teenage Dirtbag", "Wheatus", 0.5, 0.6, "young again,nostalgic"],
    ["Kilby Girl", "The Backseat Lovers", 0.3, 0.5, "young again,restless,nostalgic"],
    ["Sweater Weather", "The Neighbourhood", 0.1, 0.1, "nostalgic,longing,young again"],
    ["Take Me Home, Country Roads", "John Denver", 0.6, 0.2, "homesick,nostalgic,hopeful"],
    ["Wake Me Up When September Ends", "Green Day", -0.5, 0.0, "homesick,aching,nostalgic"],
    ["Photograph", "Ed Sheeran", 0.2, -0.2, "nostalgic,tender,longing"],
    ["Stick Season", "Noah Kahan", -0.2, 0.3, "homesick,bittersweet,restless"],
    ["Ribs", "Lorde", 0.1, 0.4, "young again,bittersweet,nostalgic"],
    ["Supercut", "Lorde", 0.2, 0.6, "nostalgic,euphoric,bittersweet"],
    ["1979", "The Smashing Pumpkins", 0.2, 0.3, "nostalgic,young again,bittersweet"],
    ["Slide", "Goo Goo Dolls", 0.4, 0.4, "young again,nostalgic"],
    ["Yellow", "Coldplay", 0.4, 0.0, "tender,nostalgic,hopeful"],
    ["White Ferrari", "Frank Ocean", -0.1, -0.4, "bittersweet,nostalgic,weightless"],
    ["Graduation (Friends Forever)", "Vitamin C", 0.4, 0.1, "bittersweet,nostalgic,young again"],
    ["Dead Man Walking", "Brent Faiyaz", -0.2, 0.0, "bittersweet,restless"],
    ["Good News", "Mac Miller", -0.3, -0.4, "numb,understood,bittersweet"],
    ["Seventeen", "Sharon Van Etten", 0.1, 0.6, "nostalgic,restless,young again"],
  ],
};
const CLUSTERS = Object.keys(POOL) as ClusterId[];

const FIRST = ["Maren", "Theo", "Aiko", "Dev", "Lucia", "Kofi", "Ines", "Ravi", "Noa", "Emeka", "Sofia", "Jonah", "Priya", "Mateo", "Yuna", "Caleb", "Amira", "Luca", "Hana", "Omar", "Freya", "Tariq", "Mina", "Elias", "Zara", "Kai", "Leila", "Arjun", "Nadia", "Hugo", "Sana", "Felix", "Ayla", "Diego", "Keiko", "Malik", "Elena", "Tomas", "Ifeoma", "Rohan", "Clara", "Idris", "Mei", "Nikolai", "Ada", "Samir", "Lina", "Bruno", "Esi", "Kenji", "Rosa", "Yusuf", "Ivy", "Marco", "Chiara", "Aaron", "Farah", "Soren", "Talia", "Quinn", "Imani", "Gabriel", "Nora", "Hassan", "Ingrid", "Leo", "Wren", "Anil", "June", "Rafael", "Selin", "Cyrus", "Mira", "Jasper", "Anya", "Tobi", "Eliza", "Karim", "Lotte", "Vikram", "Sade", "Milo", "Reza", "Astrid", "Nico", "Zainab", "Pablo", "Eun", "Oscar", "Layla", "Finn", "Dalia", "Hiro", "Maya", "Idun", "Carlos", "Nell", "Ahmad", "Suki", "Ezra"];
const INITIALS = "ABCDEFGHJKLMNOPRSTVWY";

/** Small deterministic PRNG, so the same test users come out every run. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260927);
const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
const jitter = (v: number, by: number) => Math.max(-1, Math.min(1, v + (rand() * 2 - 1) * by));

type PlannedPick = { title: string; artist: string; valence: number; energy: number; tags: string[] };
type PlannedUser = { email: string; name: string; picks: PlannedPick[] };

function planUsers(count: number): PlannedUser[] {
  const users: PlannedUser[] = [];
  for (let i = 0; i < count; i++) {
    const primary = pick(CLUSTERS);
    const secondary = rand() < 0.45 ? pick(CLUSTERS.filter((c) => c !== primary)) : null;
    const size = 4 + Math.floor(rand() * 4);
    const chosen = new Map<string, PoolSong>();
    while (chosen.size < size) {
      const from = secondary && rand() < 0.35 ? secondary : primary;
      const song = pick(POOL[from]);
      chosen.set(`${song[0]}::${song[1]}`, song);
    }
    const picks = [...chosen.values()].map(([title, artist, v, e, feelings]) => {
      const options = feelings.split(",");
      const n = rand() < 0.35 ? 1 : rand() < 0.8 ? 2 : 3;
      const tags = [...options].sort(() => rand() - 0.5).slice(0, n);
      return { title, artist, valence: jitter(v, 0.2), energy: jitter(e, 0.2), tags };
    });
    users.push({ email: `tester-${String(i + 1).padStart(3, "0")}@${TEST_DOMAIN}`, name: `${FIRST[i % FIRST.length]} ${INITIALS[i % INITIALS.length]}.`, picks });
  }
  // Wander pairs: the same song, felt in opposite ways (distance ≥ 0.9 on the mood circle).
  const contrasts: [number, number, PoolSong, [number, number, string[]], [number, number, string[]]][] = [
    [0, 1, POOL.old_selves[0], [-0.7, -0.6, ["aching", "homesick"]], [0.6, 0.6, ["fearless", "hopeful"]]],
    [2, 3, POOL.armor_up[17], [-0.6, 0.8, ["heartbroken", "restless"]], [0.8, 0.7, ["euphoric", "alive"]]],
    [4, 5, POOL.somewhere_else[0], [-0.6, -0.5, ["longing", "bittersweet"]], [0.7, 0.5, ["free", "euphoric"]]],
  ];
  for (const [a, b, [title, artist], [va, ea, ta], [vb, eb, tb]] of contrasts) {
    for (const [idx, v, e, tags] of [[a, va, ea, ta], [b, vb, eb, tb]] as const) {
      if (!users[idx]) continue;
      users[idx].picks = users[idx].picks.filter((p) => p.title !== title);
      users[idx].picks.push({ title, artist, valence: v, energy: e, tags: [...tags] });
    }
  }
  for (const u of users) for (const p of u.picks) for (const t of p.tags) if (!isValidTag(t)) throw new Error(`Bad feeling "${t}" on ${p.title}`);
  return users;
}

type Supabase = ReturnType<typeof createServerClient>;
const songCache = new Map<string, { id: string; embedding: number[] }>();

/** The catalog song for title/artist: an existing row (by name, then MusicBrainz id), or a new one. */
async function ensureSong(supabase: Supabase, title: string, artist: string) {
  const key = `${title}::${artist}`.toLowerCase();
  const cached = songCache.get(key);
  if (cached) return cached;

  const remember = (row: { id: string; embedding: unknown }) => {
    const result = { id: row.id, embedding: parseVector(row.embedding as string) };
    songCache.set(key, result);
    return result;
  };
  // By name first: most pool songs are already in the catalog, and this skips MusicBrainz for them.
  const { data: byName } = await supabase.from("songs").select("id, embedding").ilike("title", title).ilike("artist", artist).limit(1).maybeSingle();
  if (byName?.embedding) return remember(byName);

  let resolution: Awaited<ReturnType<typeof resolveSong>> = null;
  try {
    resolution = await resolveSong(title, artist);
  } catch (err) {
    console.warn(`  MusicBrainz failed for "${title}", using Gemini fallback:`, err instanceof Error ? err.message : err);
  }
  if (resolution) {
    const { data: byMbid } = await supabase.from("songs").select("id, embedding").eq("mbid", resolution.mbid).maybeSingle();
    if (byMbid?.embedding) return remember(byMbid);
  }

  const canonicalTitle = resolution?.title ?? title;
  const canonicalArtist = resolution?.artist ?? artist;
  const [{ contextSummary, embedding }, cover] = await Promise.all([
    generateSongContext(canonicalTitle, canonicalArtist),
    findCover(canonicalTitle, canonicalArtist, resolution?.releaseIds).catch(() => null),
  ]);
  const { data: inserted, error } = await supabase
    .from("songs")
    .insert({
      title: canonicalTitle,
      artist: canonicalArtist,
      mbid: resolution?.mbid ?? null,
      fallback_key: resolution ? null : `${title.trim().toLowerCase()}::${artist.trim().toLowerCase()}`,
      resolution_source: resolution ? "musicbrainz" : "gemini_fallback",
      album_art_url: cover,
      context_summary: contextSummary,
      embedding,
    })
    .select("id, embedding")
    .single();
  if (error || !inserted) throw new Error(`insert "${canonicalTitle}": ${error?.message}`);
  console.log(`  + catalog: "${canonicalTitle}" — ${canonicalArtist}${cover ? "" : " (no cover)"}`);
  return remember(inserted);
}

async function allUsers(supabase: Supabase) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

/** Runs `work` over `items`, `limit` at a time. */
async function pool<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

async function main() {
  if (PASSWORD.length < 12) throw new Error("Set SEED_DEMO_PASSWORD (12+ characters) in .env.local.");
  const supabase = createServerClient();
  const planned = planUsers(COUNT);
  const songs = [...new Map(planned.flatMap((u) => u.picks).map((p) => [`${p.title}::${p.artist}`, p])).values()];
  console.log(`${planned.length} test users, ${planned.reduce((n, u) => n + u.picks.length, 0)} picks, ${songs.length} distinct songs\n`);

  console.log("Catalog (existing songs are reused; new ones go through MusicBrainz + Gemini):");
  for (const s of songs) await ensureSong(supabase, s.title, s.artist);

  console.log("\nAccounts + picks:");
  const existing = new Map((await allUsers(supabase)).map((u) => [u.email?.toLowerCase(), u.id]));
  const ids: string[] = [];
  await pool(planned, 6, async (u) => {
    let id = existing.get(u.email);
    if (!id) {
      const { data, error } = await supabase.auth.admin.createUser({ email: u.email, password: PASSWORD, email_confirm: true, user_metadata: { display_name: u.name } });
      if (error || !data.user) throw new Error(`create ${u.email}: ${error?.message}`);
      id = data.user.id;
    }
    const rows = [];
    for (const p of u.picks) {
      const song = await ensureSong(supabase, p.title, p.artist);
      const valence = clampEmotionValue(p.valence);
      const energy = clampEmotionValue(p.energy);
      rows.push({ profile_id: id, song_id: song.id, tags: p.tags, valence, energy, embedding: buildPickEmbedding(song.embedding, valence, energy), is_public: true });
    }
    // One pick per (profile, song): re-runs leave existing picks alone.
    const { error } = await supabase.from("song_picks").upsert(rows, { onConflict: "profile_id,song_id", ignoreDuplicates: true });
    if (error) throw new Error(`picks for ${u.email}: ${error.message}`);
    await refreshPrimaryCluster(supabase, id);
    ids.push(id);
  });
  console.log(`  ${ids.length} users ready`);

  console.log("\nPortraits (skips up-to-date ones):");
  let written = 0;
  let failed = 0;
  await pool(ids, 5, async (id) => {
    try {
      if (await upsertPortrait(supabase, id)) written++;
    } catch (err) {
      failed++;
      console.error(`  portrait failed for ${id}:`, err instanceof Error ? err.message : err);
    }
  });
  console.log(`  ${written} portraits${failed ? `, ${failed} failed (re-run to retry)` : ""}`);
  console.log(`\nDone. Log in as any tester-NNN@${TEST_DOMAIN} with SEED_DEMO_PASSWORD; remove them all with scripts/remove-test-users.ts.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
