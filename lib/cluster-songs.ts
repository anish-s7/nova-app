import { getCluster } from "./clusters";
import { meParty, myPrimaryCluster, WORLD } from "./mock-world";
import { dominantCluster } from "./song-layer";
import { reasonFor } from "./texture";
import { contextFor } from "./music-context";
import type { Song } from "./types";

/**
 * Mock-only: what a cluster looks like when you open it. Real data comes from per-pick
 * clustering (see the galaxy-clusters plan); this derives the same shape from the mock world.
 */
export type ClusterListener = { id: string; name: string; isMe: boolean; reason: string; daysAgo: number };
export type ClusterSong = { song: Song; meaning: string; listeners: ClusterListener[]; mine: boolean; isNew: boolean };
/** `id` is a plain string, not `ClusterId`: real-mode clusters aren't one of the five mock ones. */
export type ClusterDetail = {
  id: string;
  label: string;
  listeners: number;
  songCount: number;
  newThisWeek: number;
  songs: ClusterSong[];
};

const NEW_WITHIN_DAYS = 7;

/** Mock-only: `id` is always one of the five mock `ClusterId`s in practice, since it only ever reads `WORLD`. */
export function buildClusterDetail(id: string): ClusterDetail {
  const members = WORLD.filter((u) => u.primary === id).map((u) => ({ id: u.id, name: u.name, isMe: false, songs: u.songs }));
  if (myPrimaryCluster() === id) {
    const me = meParty();
    members.unshift({ id: me.id, name: "You", isMe: true, songs: me.songs });
  }

  const bySong = new Map<string, ClusterSong>();
  for (const m of members) {
    for (const song of m.songs) {
      const { text, daysAgo } = reasonFor(m.id, song.id, dominantCluster(song.id));
      const entry = bySong.get(song.id) ?? { song, meaning: contextFor(song.id).meaning, listeners: [], mine: false, isNew: false };
      entry.listeners.push({ id: m.id, name: m.name, isMe: m.isMe, reason: text, daysAgo });
      entry.mine ||= m.isMe;
      entry.isNew ||= daysAgo <= NEW_WITHIN_DAYS;
      bySong.set(song.id, entry);
    }
  }

  const songs = [...bySong.values()]
    .map((s) => ({ ...s, listeners: s.listeners.sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.daysAgo - b.daysAgo) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || b.listeners.length - a.listeners.length || a.song.title.localeCompare(b.song.title));

  return {
    id,
    label: getCluster(id).label,
    listeners: members.length,
    songCount: songs.length,
    newThisWeek: songs.filter((s) => s.isNew).length,
    songs,
  };
}
