import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Schema } from "@google/genai";
import { generateJson } from "../gemini/json";
import type { Database } from "../supabase/types";

type Client = SupabaseClient<Database>;

export type NovelSong = { songId: string; title: string; artist: string; contextSummary: string | null; relevance: string };

type SongRow = { id: string; title: string; artist: string; context_summary: string | null };
type MembershipRow = { weight: number; songs: SongRow | null };
type PickRow = { tags: string[]; valence: number; energy: number; songs: { title: string; artist: string; context_summary: string | null } | null };

const RELEVANCE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    relevance: {
      type: Type.STRING,
      description: "One short, specific sentence on why this viewer (given their own songs) might like this particular song. Never generic scene description, never invents facts about the viewer.",
    },
  },
  required: ["relevance"],
};

const norm = (title: string, artist: string) => `${title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;

/**
 * The actual product value of a music-community destination (docs/plans/galaxy-communities.md): not
 * "here are some people," but one unfamiliar song from the scene the viewer doesn't already have, plus a
 * specific reason they might like it. Returns null if the scene has nothing the viewer doesn't already
 * have (or has no members at all) — an honestly-empty destination, not a fabricated one.
 */
export async function getNovelSongForScene(supabase: Client, viewerId: string, sceneId: string): Promise<NovelSong | null> {
  const [{ data: members, error: memErr }, { data: mine, error: mineErr }] = await Promise.all([
    supabase
      .from("song_scene_memberships")
      .select("weight, songs(id, title, artist, context_summary)")
      .eq("scene_id", sceneId)
      .order("weight", { ascending: false }),
    supabase.from("song_picks").select("tags, valence, energy, songs(title, artist, context_summary)").eq("profile_id", viewerId),
  ]);
  if (memErr) throw new Error(`Failed to load scene members: ${memErr.message}`);
  if (mineErr) throw new Error(`Failed to load viewer's picks: ${mineErr.message}`);

  const membershipRows = (members ?? []) as unknown as MembershipRow[];
  const pickRows = (mine ?? []) as unknown as PickRow[];

  const mineKeys = new Set(pickRows.map((p) => p.songs && norm(p.songs.title, p.songs.artist)).filter(Boolean));
  const candidate = membershipRows.map((m) => m.songs).find((s): s is SongRow => !!s && !mineKeys.has(norm(s.title, s.artist)));
  if (!candidate) return null;

  const viewerSongs = pickRows
    .filter((p) => p.songs)
    .slice(0, 10)
    .map((p) => `"${p.songs!.title}" by ${p.songs!.artist} (tags: ${p.tags.join(", ")})`)
    .join("\n");

  const { data } = await generateJson<{ relevance: string }>({
    system:
      "You explain, in one sentence, why someone might like a specific song given the songs they already " +
      "listen to. Be specific to the pairing, never a generic genre blurb. Never invent facts about the " +
      "person beyond what their own songs show.",
    prompt: `Viewer's songs:\n${viewerSongs || "(none yet)"}\n\nCandidate song: "${candidate.title}" by ${candidate.artist}${
      candidate.context_summary ? ` — ${candidate.context_summary}` : ""
    }`,
    schema: RELEVANCE_SCHEMA,
  });

  return { songId: candidate.id, title: candidate.title, artist: candidate.artist, contextSummary: candidate.context_summary, relevance: data.relevance };
}
