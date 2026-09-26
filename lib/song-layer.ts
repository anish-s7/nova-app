import { getCluster, type ClusterId } from "./clusters";
import { contextFor, songById } from "./music-context";
import { effectiveSongs, getSession } from "./session";
import { ME_ID, meParty, WORLD } from "./mock-world";
import { reasonFor } from "./texture";
import { listenerWhy, mixFromScores, type WhyMix } from "./why-mix";
import { THEME_IDS, THEME_THRESHOLD, THEMES, type Theme, type ThemeId } from "./themes";
import type { Song } from "./types";

/**
 * The song layer: every song someone in the galaxy has picked becomes a star, sized by how many
 * people share it. Mock-only; real data would come from per-pick clustering (see db/contract.md).
 */
export type SongPick = { songId: string; reason: string; themes: ThemeId[]; addedAt: number };

/** `why` is why this person has this song, which can differ from the person sitting next to them. */
export type SongListener = { id: string; name: string; isMe: boolean; reason: string; daysAgo: number; why: ClusterId };

export type SongStar = {
  /** Catalog song id. The scene uses `songNodeId(id)`. */
  id: string;
  song: Song;
  meaning: string;
  /** The why most of its listeners have it for, used for color. Ties go to the song's own strongest lean. */
  cluster: ClusterId;
  listeners: SongListener[];
  /** People per why, strongest first. More than one entry makes this a bridge. */
  whyCounts: { id: ClusterId; count: number }[];
  /** Two or more listeners, with two or more different whys among them. */
  isBridge: boolean;
  /** Why this song would land for you, whether or not you have it. */
  myWhy: ClusterId;
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

  const mixOf = new Map<string, WhyMix>(WORLD.map((u) => [u.id, mixFromScores(u.vector)]));
  const whyOf = (userId: string, songId: string) => listenerWhy(contextFor(songId).clusters, mixOf.get(userId)!);

  for (const u of WORLD) {
    for (const s of u.songs) {
      const { text, daysAgo } = reasonFor(u.id, s.id, dominantCluster(s.id));
      add(s.id, { id: u.id, name: u.name, isMe: false, reason: text, daysAgo, why: whyOf(u.id, s.id) });
    }
  }
  mixOf.set(ME_ID, mixFromScores(meParty().vector));

  const mine = new Map<string, SongListener>();
  for (const s of effectiveSongs(getSession())) {
    const { text, daysAgo } = reasonFor(ME_ID, s.id, dominantCluster(s.id));
    mine.set(s.id, { id: ME_ID, name: "You", isMe: true, reason: text, daysAgo, why: whyOf(ME_ID, s.id) });
  }
  // What you typed yourself always wins over the generated line.
  for (const p of picks) mine.set(p.songId, { id: ME_ID, name: "You", isMe: true, reason: p.reason || "It just means something to me", daysAgo: 0, why: whyOf(ME_ID, p.songId) });
  for (const [songId, l] of mine) add(songId, l);

  const themesFor = new Map<string, Set<ThemeId>>();
  const tag = (songId: string, t: ThemeId) => themesFor.set(songId, (themesFor.get(songId) ?? new Set()).add(t));
  for (const id of THEME_IDS) for (const songId of THEMES[id].seed) if (bySong.has(songId)) tag(songId, id);
  for (const p of picks) for (const t of p.themes) tag(p.songId, t);

  const stars: SongStar[] = [...bySong].map(([songId, listeners]) => {
    const sorted = [...listeners].sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.daysAgo - b.daysAgo);
    const own = dominantCluster(songId);
    const counts = new Map<ClusterId, number>();
    for (const l of sorted) counts.set(l.why, (counts.get(l.why) ?? 0) + 1);
    const whyCounts = [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || Number(b.id === own) - Number(a.id === own));
    return {
      id: songId,
      song: songById(songId),
      meaning: contextFor(songId).meaning,
      cluster: whyCounts[0]?.id ?? own,
      listeners: sorted,
      whyCounts,
      isBridge: sorted.length >= 2 && whyCounts.length >= 2,
      myWhy: whyOf(ME_ID, songId),
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
