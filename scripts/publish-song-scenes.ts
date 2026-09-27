/**
 * Publishes the 4 real scene candidates found by scripts/propose-song-scenes.ts against the live
 * catalog (2026-09-26) — see docs/plans/galaxy-communities.md, revised-path step 4. Hardcoded rather than
 * re-running the proposal pipeline live, because these 4 groupings were already reviewed by hand; this
 * script's own job is just: generate a label+description per group (one Gemini call each, reviewed before
 * being printed — this script does NOT auto-approve, it prints what it's about to write and asks nothing
 * further, so read the output), then write song_scenes (status='published') + song_scene_memberships.
 *
 * Matches by title+artist rather than a single hardcoded song id, because the catalog has known
 * duplicate rows per song (backburner #1, CLAUDE.md) — every duplicate of a group's song becomes a member,
 * so a scene isn't accidentally missing someone whose pick points at the "other" duplicate row.
 *
 * Inserts scenes as status='reviewed', never 'published', regardless of how good the generated label
 * looks: a first real run of this script produced "Grieving in the Kitchen" for an art-pop group (Flash
 * hit a 429 quota error, silently fell back to Flash-Lite, and the label drifted into mood language —
 * exactly the "why, not what" mistake this whole feature exists to avoid). A human must read every
 * generated label/description and flip status to 'published' by hand (the API route only serves
 * 'published' scenes) — this script printing the output is not itself the review.
 *
 *   node --env-file=.env.local --import tsx scripts/publish-song-scenes.ts
 */
import { createServerClient } from "../lib/supabase/server";
import { generateJson } from "../lib/gemini/json";
import { Type, type Schema } from "@google/genai";

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    label: { type: Type.STRING, description: "2-4 word scene name, e.g. 'Late-Night Ambient Folk'. No genre jargon a listener wouldn't recognize." },
    description: { type: Type.STRING, description: "One sentence, plain language, what this scene sounds like — never mentions specific users." },
  },
  required: ["label", "description"],
};

type GroupSong = { title: string; artist: string; weight: number; source: "musicbrainz_tag" | "embedding_fallback" };

const GROUPS: { key: string; songs: GroupSong[] }[] = [
  {
    key: "folk",
    songs: [
      { title: "Holocene", artist: "Bon Iver", weight: 1, source: "musicbrainz_tag" },
      { title: "Heartbeats", artist: "José González", weight: 1, source: "musicbrainz_tag" },
      { title: "The Night We Met", artist: "Lord Huron", weight: 0.692, source: "embedding_fallback" },
    ],
  },
  {
    key: "classical",
    songs: [
      { title: "Gymnopedie No. 1", artist: "Erik Satie", weight: 1, source: "musicbrainz_tag" },
      { title: "Nuvole bianche", artist: "Ludovico Einaudi", weight: 1, source: "musicbrainz_tag" },
      { title: "Clair de Lune", artist: "Claude Debussy", weight: 0.796, source: "embedding_fallback" },
    ],
  },
  {
    key: "art pop",
    songs: [
      { title: "Fourth of July", artist: "Sufjan Stevens", weight: 1, source: "musicbrainz_tag" },
      { title: "Casimir Pulaski Day", artist: "Sufjan Stevens", weight: 1, source: "musicbrainz_tag" },
      { title: "Landslide", artist: "Fleetwood Mac", weight: 1, source: "musicbrainz_tag" },
    ],
  },
  {
    key: "ambient pop",
    songs: [
      { title: "Holocene", artist: "Bon Iver", weight: 1, source: "musicbrainz_tag" },
      { title: "Skinny Love", artist: "Bon Iver", weight: 1, source: "musicbrainz_tag" },
    ],
  },
];

const MIN_GEMINI_INTERVAL_MS = 4500;

async function main() {
  const supabase = createServerClient();

  for (const group of GROUPS) {
    const started = Date.now();
    const { data } = await generateJson<{ label: string; description: string }>({
      system:
        "You name musical scenes for a listening app. Given representative songs, produce a short, human " +
        "(never 'AI-sounding') scene name and a one-sentence description of what it sounds like. Never " +
        "mention any user or listener, only the music itself.",
      prompt: `Representative songs:\n${group.songs.map((s) => `"${s.title}" by ${s.artist}`).join("\n")}`,
      schema: SCHEMA,
    });
    console.log(`\n"${group.key}" -> label: "${data.label}"  |  description: "${data.description}"`);

    const { data: scene, error: sceneErr } = await supabase
      .from("song_scenes")
      .insert({ label: data.label, description: data.description, status: "reviewed" })
      .select("id")
      .single();
    if (sceneErr) throw new Error(`Failed to insert scene "${group.key}": ${sceneErr.message}`);

    for (const song of group.songs) {
      const { data: matches, error: songErr } = await supabase
        .from("songs")
        .select("id")
        .ilike("title", song.title)
        .ilike("artist", song.artist);
      if (songErr) throw new Error(`Failed to look up "${song.title}" by ${song.artist}: ${songErr.message}`);
      if (!matches?.length) {
        console.warn(`  (no catalog row found for "${song.title}" by ${song.artist} — skipped)`);
        continue;
      }
      for (const m of matches) {
        const { error: memErr } = await supabase.from("song_scene_memberships").insert({
          song_id: m.id,
          scene_id: scene.id,
          weight: song.weight,
          source: song.source,
          model_version: data ? "gemini-scene-label-v1" : null,
        });
        if (memErr) console.warn(`  membership insert failed for song ${m.id}: ${memErr.message}`);
      }
      console.log(`  + "${song.title}" by ${song.artist} (${matches.length} catalog row${matches.length > 1 ? "s" : ""}, ${song.source}, weight ${song.weight})`);
    }

    const wait = MIN_GEMINI_INTERVAL_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }

  console.log("\nDone. 4 scenes published.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
