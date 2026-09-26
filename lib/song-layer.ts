import { getCluster, type ClusterId } from "./clusters";
import { contextFor, songById } from "./music-context";
import { effectiveSongs, getSession } from "./session";
import { ME_ID, WORLD } from "./mock-world";
import { reasonFor } from "./texture";
import { THEME_IDS, THEME_THRESHOLD, THEMES, type Theme, type ThemeId } from "./themes";
import type { Song } from "./types";

/**
 * The song layer: every song someone in the galaxy has picked becomes a star, sized by how many
 * people share it. Mock-only; real data would come from per-pick clustering (see db/contract.md).
 */
export type SongPick = { songId: string; reason: string; themes: ThemeId[]; addedAt: number };

export type SongListener = { id: string; name: string; isMe: boolean; reason: string; daysAgo: number };

export type SongStar = {
  /** Catalog song id. The scene uses `songNodeId(id)`. */
  id: string;
  song: Song;
  meaning: string;
  /** The "why" this song leans hardest toward, used for color and placement. */
  cluster: ClusterId;
  listeners: SongListener[];
  themes: ThemeId[];
  weight: number;
  isNew: boolean;
};

export type ThemeState = {
  theme: Theme;
  songIds: string[];
  formed: boolean;
  /** How many of the songs are yours. */
  mine: number;
};

export type SongLayer = { stars: SongStar[]; themes: ThemeState[] };

export const songNodeId = (songId: string) => `song:${songId}`;
export const isSongNode = (id: string) => id.startsWith("song:");
export const songIdFromNode = (id: string) => id.slice("song:".length);

const NEW_WITHIN_DAYS = 7;

export function dominantCluster(songId: string): ClusterId {
  const entries = Object.entries(contextFor(songId).clusters) as [ClusterId, number][];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? "quiet_company";
}

export function buildSongLayer(picks: SongPick[] = []): SongLayer {
  const bySong = new Map<string, SongListener[]>();
  const add = (songId: string, l: SongListener) => {
    const list = bySong.get(songId) ?? [];
    list.push(l);
    bySong.set(songId, list);
  };

  for (const u of WORLD) {
    for (const s of u.songs) {
      const { text, daysAgo } = reasonFor(u.id, s.id, dominantCluster(s.id));
      add(s.id, { id: u.id, name: u.name, isMe: false, reason: text, daysAgo });
    }
  }

  const mine = new Map<string, SongListener>();
  for (const s of effectiveSongs(getSession())) {
    const { text, daysAgo } = reasonFor(ME_ID, s.id, dominantCluster(s.id));
    mine.set(s.id, { id: ME_ID, name: "You", isMe: true, reason: text, daysAgo });
  }
  // What you typed yourself always wins over the generated line.
  for (const p of picks) mine.set(p.songId, { id: ME_ID, name: "You", isMe: true, reason: p.reason || "It just means something to me", daysAgo: 0 });
  for (const [songId, l] of mine) add(songId, l);

  const themesFor = new Map<string, Set<ThemeId>>();
  const tag = (songId: string, t: ThemeId) => themesFor.set(songId, (themesFor.get(songId) ?? new Set()).add(t));
  for (const id of THEME_IDS) for (const songId of THEMES[id].seed) if (bySong.has(songId)) tag(songId, id);
  for (const p of picks) for (const t of p.themes) tag(p.songId, t);

  const stars: SongStar[] = [...bySong].map(([songId, listeners]) => {
    const sorted = [...listeners].sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.daysAgo - b.daysAgo);
    return {
      id: songId,
      song: songById(songId),
      meaning: contextFor(songId).meaning,
      cluster: dominantCluster(songId),
      listeners: sorted,
      themes: [...(themesFor.get(songId) ?? [])],
      weight: sorted.length,
      isNew: sorted.some((l) => l.daysAgo <= NEW_WITHIN_DAYS),
    };
  });
  stars.sort((a, b) => b.weight - a.weight || a.song.title.localeCompare(b.song.title));

  const myIds = new Set(mine.keys());
  const themes: ThemeState[] = THEME_IDS.map((id) => {
    const songIds = stars.filter((s) => s.themes.includes(id)).map((s) => s.id);
    return { theme: THEMES[id], songIds, formed: songIds.length >= THEME_THRESHOLD, mine: songIds.filter((s) => myIds.has(s)).length };
  }).sort((a, b) => Number(b.formed) - Number(a.formed) || b.songIds.length - a.songIds.length);

  return { stars, themes };
}

/** What adding a pick changed, for the toast: did a theme form, and who else already has this song. */
export function describePick(current: SongPick[], pick: SongPick) {
  const before = buildSongLayer(current);
  const after = buildSongLayer([...current.filter((p) => p.songId !== pick.songId), pick]);
  const star = after.stars.find((s) => s.id === pick.songId)!;
  const wasThere = before.stars.some((s) => s.id === pick.songId);
  const formed = pick.themes
    .map((id) => ({ was: before.themes.find((t) => t.theme.id === id)?.formed, now: after.themes.find((t) => t.theme.id === id) }))
    .filter((t) => !t.was && t.now?.formed)
    .map((t) => t.now!.theme);
  return { star, wasThere, others: star.listeners.filter((l) => !l.isMe).length, formed, cluster: getCluster(star.cluster) };
}
