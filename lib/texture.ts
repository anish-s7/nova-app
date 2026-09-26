import type { ClusterId } from "./clusters";
import type { ListeningMoment, Song } from "./types";

/**
 * Mock-only texture: the specific, slightly untidy details a real profile would carry
 * (a line in the person's own words, a playlist name, when they last played it).
 * Deterministic per user so the same person always reads the same way.
 */

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const MOMENTS: Record<ClusterId, string[]> = {
  quiet_company: ["for late-night walks", "when the apartment's too quiet", "on the last train home", "doing dishes after midnight"],
  armor_up: ["before I walk into work", "for getting through Mondays", "in the car before a hard meeting", "the ten minutes before a run"],
  carrying_loss: ["when I'm thinking about my dad", "on my grandma's birthday", "driving past our old street", "the week after he moved away"],
  somewhere_else: ["when I need to disappear for a bit", "on the bus, window seat", "songs I play while cooking", "Sunday afternoons with the blinds down"],
  old_selves: ["takes me back to senior year", "the car we drove in 2016", "the summer I worked at the pool", "our old dorm playlist"],
};

const PLAYLISTS: Record<ClusterId, string[]> = {
  quiet_company: ["3am kitchen", "night bus", "walk home"],
  armor_up: ["monday", "gym, no talking", "before the meeting"],
  carrying_loss: ["for dad", "slow", "don't skip"],
  somewhere_else: ["window seat", "cooking sunday", "gone for a bit"],
  old_selves: ["senior year", "2016", "road trip 1"],
};

const WHEN = ["last played Tuesday night", "added 3 weeks ago", "played twice yesterday", "on repeat since March", "last played 4 days ago", "added over the summer"];

export function listeningMoment(userId: string, songs: Song[], cluster: ClusterId): ListeningMoment | undefined {
  if (!songs.length) return undefined;
  const h = hash(userId + cluster);
  const pick = <T,>(list: T[], salt: number) => list[(h >>> salt) % list.length];
  return {
    text: pick(MOMENTS[cluster], 0),
    song: songs[(h >>> 3) % songs.length],
    playlist: h % 3 === 0 ? undefined : pick(PLAYLISTS[cluster], 5),
    when: pick(WHEN, 7),
  };
}

/** A person's own words for why one specific song matters, deterministic per (user, song). */
export function reasonFor(userId: string, songId: string, cluster: ClusterId) {
  const h = hash(userId + songId);
  const list = MOMENTS[cluster];
  return { text: list[h % list.length], daysAgo: 1 + ((h >>> 5) % 34) };
}
