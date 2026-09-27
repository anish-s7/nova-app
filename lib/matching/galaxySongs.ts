import { createServerClient } from "../supabase/server";
import { pickWhy } from "../cluster-assign";
import { getGalaxyWindow } from "./galaxyWindow";

/**
 * The song layer, real: every song picked by someone in your galaxy window (and you), with who has it
 * and why. No Gemini and no vectors, just picks, so loading it is as cheap as the window itself.
 * Only public picks of other people are read (this uses the service role, which bypasses RLS,
 * so privacy is enforced here, like GET /api/profile).
 */

export interface SongListenerRow {
  id: string;
  name: string;
  isMe: boolean;
  /** Their own words, if they wrote any (reason_text is optional now). */
  reason: string;
  daysAgo: number;
  /** Why this person has this song (the cluster its tags/slider lean toward). */
  why: string;
}

export interface GalaxySongRow {
  id: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  spotifyId: string | null;
  /** Gemini's one-line read of the song (songs.context_summary), if generated. */
  meaning: string | null;
  listeners: SongListenerRow[];
}

export interface GalaxySongs {
  meId: string;
  people: { id: string; name: string; cluster: string }[];
  songs: GalaxySongRow[];
}

type PickJoin = {
  profile_id: string;
  tags: string[];
  tag_whys: string[] | null;
  valence: number;
  energy: number;
  reason_text: string | null;
  created_at: string;
  songs: { id: string; title: string; artist: string; album_art_url: string | null; spotify_track_id: string | null; context_summary: string | null } | null;
};

export async function getGalaxySongs(profileId: string): Promise<GalaxySongs> {
  const window = await getGalaxyWindow(profileId);
  const people = window.nodes.map((n) => ({ id: n.profileId, name: n.displayName, cluster: n.cluster }));
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const ids = Array.from(new Set([profileId, ...people.map((p) => p.id)]));

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("song_picks")
    .select("profile_id, tags, tag_whys, valence, energy, reason_text, created_at, is_public, songs(id, title, artist, album_art_url, spotify_track_id, context_summary)")
    .in("profile_id", ids);
  if (error) throw new Error(`getGalaxySongs failed: ${error.message}`);

  const now = Date.now();
  const bySong = new Map<string, GalaxySongRow>();
  for (const row of (data ?? []) as unknown as (PickJoin & { is_public: boolean })[]) {
    if (!row.songs) continue;
    const isMe = row.profile_id === profileId;
    if (!isMe && !row.is_public) continue;
    const star =
      bySong.get(row.songs.id) ??
      {
        id: row.songs.id,
        title: row.songs.title,
        artist: row.songs.artist,
        albumArtUrl: row.songs.album_art_url,
        spotifyId: row.songs.spotify_track_id,
        meaning: row.songs.context_summary,
        listeners: [],
      };
    star.listeners.push({
      id: row.profile_id,
      name: isMe ? "You" : (nameOf.get(row.profile_id) ?? "Someone"),
      isMe,
      reason: row.reason_text ?? "",
      daysAgo: Math.max(0, Math.floor((now - new Date(row.created_at).getTime()) / 86_400_000)),
      why: pickWhy(row, row.profile_id),
    });
    bySong.set(row.songs.id, star);
  }

  return { meId: profileId, people, songs: [...bySong.values()] };
}
