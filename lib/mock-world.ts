import { CLUSTERS, CLUSTER_IDS, type ClusterId } from "./clusters";
import { contextFor, songById, songsInCluster, type SongMode } from "./music-context";
import { cosine, dominantMode, infer, primaryCluster, vectorFromMotivations, type Vector } from "./inference";
import type { ConnectionCard, ContextTag, GalaxyEdge, InferredMotivation, ListeningSignal, Message, Song, SongSwap, User } from "./types";

export const ME_ID = "me";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

const CLUSTER_TAGS: Record<ClusterId, ContextTag[]> = {
  quiet_company: ["late_night", "alone", "studying"],
  armor_up: ["getting_ready", "workout", "commute"],
  carrying_loss: ["on_repeat", "alone", "late_night"],
  somewhere_else: ["after_a_hard_day", "commute", "studying"],
  old_selves: ["with_friends", "on_repeat", "commute"],
};

const LATE_SHARE: Record<ClusterId, [number, number]> = {
  quiet_company: [0.45, 0.8],
  armor_up: [0, 0.15],
  carrying_loss: [0.3, 0.6],
  somewhere_else: [0.1, 0.35],
  old_selves: [0.05, 0.3],
};

export function synthesizeSignals(userId: string, songs: Song[], cluster: ClusterId): ListeningSignal[] {
  const r = rng(hash(userId));
  const [lo, hi] = LATE_SHARE[cluster];
  return songs.map((s) => {
    const tags = CLUSTER_TAGS[cluster];
    return {
      songId: s.id,
      playCount: Math.round(14 + r() * 70),
      lateNightShare: Math.round((lo + r() * (hi - lo)) * 100) / 100,
      contextTags: [tags[Math.floor(r() * tags.length)]],
    };
  });
}

type Seed = { id: string; name: string; primary: ClusterId; secondary: ClusterId; songIds?: string[] };

// Curated first: these are the guaranteed demo matches for anyone who reads as "quiet company".
// Their artists are deliberately disjoint from the demo persona and from each other.
export const DEMO_MATCH_IDS = ["jordan", "theo", "amara"];

const SEEDS: Seed[] = [
  { id: "jordan", name: "Jordan", primary: "quiet_company", secondary: "old_selves", songIds: ["marvins-room", "snooze", "good-news", "get-you", "dead-man-walking"] },
  { id: "theo", name: "Theo", primary: "quiet_company", secondary: "somewhere_else", songIds: ["weightless", "clair-de-lune", "intro-xx", "gymnopedie", "heartbeats"] },
  { id: "amara", name: "Amara", primary: "quiet_company", secondary: "carrying_loss", songIds: ["glimpse-of-us", "nuvole-bianche", "bags", "tadow", "hurt"] },
  { id: "wren", name: "Wren", primary: "quiet_company", secondary: "carrying_loss" },
  { id: "kai", name: "Kai", primary: "quiet_company", secondary: "somewhere_else" },
  { id: "lucia", name: "Lucía", primary: "quiet_company", secondary: "old_selves" },
  { id: "dev", name: "Dev", primary: "quiet_company", secondary: "armor_up" },
  { id: "hana", name: "Hana", primary: "quiet_company", secondary: "somewhere_else" },

  { id: "noor", name: "Noor", primary: "armor_up", secondary: "old_selves" },
  { id: "marcus", name: "Marcus", primary: "armor_up", secondary: "carrying_loss" },
  { id: "priyanka", name: "Priyanka", primary: "armor_up", secondary: "somewhere_else" },
  { id: "diego", name: "Diego", primary: "armor_up", secondary: "old_selves" },
  { id: "sade", name: "Sade", primary: "armor_up", secondary: "quiet_company" },
  { id: "tomas", name: "Tomás", primary: "armor_up", secondary: "somewhere_else" },
  { id: "keisha", name: "Keisha", primary: "armor_up", secondary: "carrying_loss" },
  { id: "ben", name: "Ben", primary: "armor_up", secondary: "old_selves" },

  { id: "sam", name: "Sam", primary: "carrying_loss", secondary: "quiet_company" },
  { id: "mira", name: "Mira", primary: "carrying_loss", secondary: "old_selves" },
  { id: "elijah", name: "Elijah", primary: "carrying_loss", secondary: "armor_up" },
  { id: "yuki", name: "Yuki", primary: "carrying_loss", secondary: "somewhere_else" },
  { id: "rosa", name: "Rosa", primary: "carrying_loss", secondary: "quiet_company" },
  { id: "owen", name: "Owen", primary: "carrying_loss", secondary: "old_selves" },
  { id: "fatima", name: "Fatima", primary: "carrying_loss", secondary: "quiet_company" },
  { id: "jonah", name: "Jonah", primary: "carrying_loss", secondary: "somewhere_else" },

  { id: "ava", name: "Ava", primary: "somewhere_else", secondary: "quiet_company" },
  { id: "ravi", name: "Ravi", primary: "somewhere_else", secondary: "armor_up" },
  { id: "zoe", name: "Zoe", primary: "somewhere_else", secondary: "old_selves" },
  { id: "malik", name: "Malik", primary: "somewhere_else", secondary: "quiet_company" },
  { id: "ines", name: "Inés", primary: "somewhere_else", secondary: "carrying_loss" },
  { id: "felix", name: "Felix", primary: "somewhere_else", secondary: "old_selves" },
  { id: "leila", name: "Leila", primary: "somewhere_else", secondary: "armor_up" },
  { id: "nate", name: "Nate", primary: "somewhere_else", secondary: "quiet_company" },

  { id: "claire", name: "Claire", primary: "old_selves", secondary: "carrying_loss" },
  { id: "andre", name: "Andre", primary: "old_selves", secondary: "armor_up" },
  { id: "mei", name: "Mei", primary: "old_selves", secondary: "somewhere_else" },
  { id: "luca", name: "Luca", primary: "old_selves", secondary: "quiet_company" },
  { id: "tessa", name: "Tessa", primary: "old_selves", secondary: "carrying_loss" },
  { id: "omar", name: "Omar", primary: "old_selves", secondary: "armor_up" },
  { id: "gabe", name: "Gabe", primary: "old_selves", secondary: "somewhere_else" },
  { id: "june", name: "June", primary: "old_selves", secondary: "quiet_company" },
];

/** Songs the curated demo matches own. Generated users avoid them so the curated overlap stays at zero. */
const RESERVED = new Set(SEEDS.slice(0, 3).flatMap((s) => s.songIds ?? []));

function pickSongs(seed: Seed): Song[] {
  if (seed.songIds) return seed.songIds.map(songById);
  const r = rng(hash(seed.id + "songs"));
  const take = (pool: Song[], n: number, taken: Set<string>) => {
    const avail = pool.filter((s) => !taken.has(s.id) && !RESERVED.has(s.id));
    const out: Song[] = [];
    while (out.length < n && avail.length) out.push(avail.splice(Math.floor(r() * avail.length), 1)[0]);
    out.forEach((s) => taken.add(s.id));
    return out;
  };
  const taken = new Set<string>();
  return [...take(songsInCluster(seed.primary, 0.7), 4, taken), ...take(songsInCluster(seed.secondary, 0.6), 1, taken)];
}

export type WorldUser = User & { primary: ClusterId; vector: Vector; mode: SongMode; signals: ListeningSignal[] };

function buildUser(seed: Seed): WorldUser {
  const songs = pickSongs(seed);
  const signals = synthesizeSignals(seed.id, songs, seed.primary);
  const { motivations } = infer({
    userId: seed.id,
    subject: { isMe: false, name: seed.name },
    songs,
    signals,
    bias: { [seed.primary]: 1.2, [seed.secondary]: 0.5 },
  });
  const r = rng(hash(seed.id + "privacy"));
  const withPrivacy = motivations.map((m, i) => ({ ...m, isPublic: i < 2 || r() > 0.5 }));
  return {
    id: seed.id,
    name: seed.name,
    songs,
    signals,
    motivations: withPrivacy,
    primary: seed.primary,
    vector: vectorFromMotivations(withPrivacy),
    mode: dominantMode(songs),
  };
}

export const WORLD: WorldUser[] = SEEDS.map(buildUser);
const worldById = new Map(WORLD.map((u) => [u.id, u]));

export function worldUser(id: string) {
  return worldById.get(id);
}

/** Someone who "joins" the galaxy mid-session, to show realtime arrival. */
export function buildArrival(cluster: ClusterId): WorldUser {
  return buildUser({ id: "priya", name: "Priya", primary: cluster, secondary: cluster === "old_selves" ? "somewhere_else" : "old_selves" });
}

// ---------------------------------------------------------------------------
// Similarity

export type Party = { id: string; name: string; songs: Song[]; motivations: InferredMotivation[]; vector: Vector; mode: SongMode };

export function overlap(a: Song[], b: Song[]) {
  const ids = new Set(a.map((s) => s.id));
  const artists = new Set(a.map((s) => s.artist));
  return {
    sharedSongs: b.filter((s) => ids.has(s.id)).length,
    sharedArtists: new Set(b.filter((s) => artists.has(s.artist)).map((s) => s.artist)).size,
  };
}

function sharedCluster(a: Vector, b: Vector): ClusterId {
  return CLUSTER_IDS.reduce((best, c) => (Math.min(a[c], b[c]) > Math.min(a[best], b[best]) ? c : best), CLUSTER_IDS[0]);
}

export function edgeBetween(a: Party, b: Party): GalaxyEdge {
  const o = overlap(a.songs, b.songs);
  return {
    source: a.id,
    target: b.id,
    similarity: Math.round(cosine(a.vector, b.vector) * 1000) / 1000,
    sharedMotivation: CLUSTERS[sharedCluster(a.vector, b.vector)].label,
    ...o,
  };
}

/** Keeps each node's strongest few neighbors so the graph stays legible. */
export function buildEdges(parties: Party[], perNode = 4, meId?: string): GalaxyEdge[] {
  const all: GalaxyEdge[] = [];
  for (let i = 0; i < parties.length; i++)
    for (let j = i + 1; j < parties.length; j++) all.push(edgeBetween(parties[i], parties[j]));
  const keep = new Set<GalaxyEdge>();
  for (const p of parties) {
    const n = p.id === meId ? 8 : perNode;
    all
      .filter((e) => e.source === p.id || e.target === p.id)
      .sort((x, y) => y.similarity - x.similarity)
      .slice(0, n)
      .forEach((e) => keep.add(e));
  }
  return [...keep];
}

export function partyFromWorld(u: WorldUser): Party {
  return { id: u.id, name: u.name, songs: u.songs, motivations: u.motivations, vector: u.vector, mode: u.mode };
}

// ---------------------------------------------------------------------------
// Connection cards

const APPROACH: Record<ClusterId, Record<SongMode, [you: string, them: string]>> = {
  quiet_company: {
    lean_in: ["turn toward the quiet, with songs that sound like being alone", "turns toward the quiet, with songs that sound like being alone"],
    lift: ["fill the quiet with warmth, with songs that sound like company", "fills the quiet with warmth, with songs that sound like company"],
  },
  armor_up: {
    lean_in: ["steady yourself with slow-burn songs about getting back up", "steadies themselves with slow-burn songs about getting back up"],
    lift: ["turn the volume all the way up and let the beat decide", "turns the volume all the way up and lets the beat decide"],
  },
  carrying_loss: {
    lean_in: ["stay inside the sadness until it softens", "stays inside the sadness until it softens"],
    lift: ["reach for songs that make remembering feel like celebrating", "reaches for songs that make remembering feel like celebrating"],
  },
  somewhere_else: {
    lean_in: ["slow everything down until the room goes still", "slows everything down until the room goes still"],
    lift: ["leave through songs that sound like other cities and other summers", "leaves through songs that sound like other cities and other summers"],
  },
  old_selves: {
    lean_in: ["revisit the bittersweet parts", "revisits the bittersweet parts"],
    lift: ["replay the good years at full volume", "replays the good years at full volume"],
  },
};

const OPENERS: Record<ClusterId, string> = {
  quiet_company: "What do you put on when your place gets too quiet?",
  armor_up: "What's the one song you play before something you're dreading?",
  carrying_loss: "Is there a song that brings someone back for you?",
  somewhere_else: "Where does music take you when you need to get out for a bit?",
  old_selves: "What song instantly takes you back to a specific year?",
};

function bestSongFor(p: Party, cluster: ClusterId): Song {
  return [...p.songs].sort((a, b) => (contextFor(b.id).clusters[cluster] ?? 0) - (contextFor(a.id).clusters[cluster] ?? 0))[0];
}

function evidenceLine(p: Party, cluster: ClusterId): { song: Song; text: string } {
  const m = p.motivations.find((x) => x.cluster === cluster && x.feedback !== "rejected");
  const e = m?.evidence.find((x) => x.kind !== "song_context" && x.songIds.length) ?? m?.evidence[0];
  if (e) {
    const song = p.songs.find((s) => s.id === e.songIds[0]) ?? bestSongFor(p, cluster);
    return { song, text: e.text };
  }
  const song = bestSongFor(p, cluster);
  return { song, text: `"${song.title}" ${contextFor(song.id).meaning}.` };
}

export function buildConnectionCard(a: Party, b: Party): ConnectionCard {
  const ranked = CLUSTER_IDS.map((c) => ({ c, v: Math.min(a.vector[c], b.vector[c]) })).sort((x, y) => y.v - x.v);
  const shared = ranked.filter((x, i) => i === 0 || x.v >= 0.35).slice(0, 2);
  const primary = shared[0].c;

  let meaningfulDifference: ConnectionCard["meaningfulDifference"];
  if (a.mode !== b.mode) {
    const songA = bestSongFor(a, primary);
    const songB = bestSongFor(b, primary);
    meaningfulDifference = {
      summary: `Same reason, opposite approach. You ${APPROACH[primary][a.mode][0]}. ${b.name} ${APPROACH[primary][b.mode][1]}.`,
      evidenceA: `"${songA.title}" ${contextFor(songA.id).meaning}.`,
      evidenceB: `"${songB.title}" ${contextFor(songB.id).meaning}.`,
    };
  } else {
    const other = (p: Party) =>
      [...p.motivations].filter((m) => m.cluster !== primary && m.feedback !== "rejected").sort((x, y) => y.confidence - x.confidence)[0];
    const oa = other(a);
    const ob = other(b);
    const ca = (oa?.cluster as ClusterId) ?? primary;
    const cb = (ob?.cluster as ClusterId) ?? primary;
    const songA = bestSongFor(a, ca);
    const songB = bestSongFor(b, cb);
    meaningfulDifference =
      ca !== cb
        ? {
            summary: `Where you split: you also use music as "${CLUSTERS[ca].label.toLowerCase()}". For ${b.name}, it's "${CLUSTERS[cb].label.toLowerCase()}".`,
            evidenceA: `"${songA.title}" ${contextFor(songA.id).meaning}.`,
            evidenceB: `"${songB.title}" ${contextFor(songB.id).meaning}.`,
          }
        : {
            summary: `You get to the same place from different directions: you through ${songA.artist}, ${b.name} through ${songB.artist}.`,
            evidenceA: `"${songA.title}" ${contextFor(songA.id).meaning}.`,
            evidenceB: `"${songB.title}" ${contextFor(songB.id).meaning}.`,
          };
  }

  const songB = bestSongFor(b, primary);
  return {
    userA: a.id,
    userB: b.id,
    overlap: overlap(a.songs, b.songs),
    sharedMotivations: shared.map(({ c }) => ({
      motivation: CLUSTERS[c].label,
      evidenceA: evidenceLine(a, c),
      evidenceB: evidenceLine(b, c),
    })),
    meaningfulDifference,
    suggestedOpeners: [
      OPENERS[primary],
      `What's the story behind "${songB.title}" for you?`,
      `I've never really listened to ${songB.artist}. Where should I start?`,
    ],
  };
}

// ---------------------------------------------------------------------------
// Conversations (module-level, in-memory)

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function swap(id: string, from: string, to: string, songId: string, reason: string, status: SongSwap["status"]): SongSwap {
  return { id, fromUserId: from, toUserId: to, song: songById(songId), reason, status };
}

const seedConversations = (): [string, Message[]][] => [
  [
    "noor",
    [
      { id: "n1", fromUserId: "noor", sentAt: minutesAgo(60 * 26), kind: "text", text: "ok the galaxy put us together and I have questions" },
      { id: "n2", fromUserId: ME_ID, sentAt: minutesAgo(60 * 25), kind: "text", text: "ha same. you really play Lose Yourself before every exam?" },
      {
        id: "n3",
        fromUserId: "noor",
        sentAt: minutesAgo(60 * 24),
        kind: "swap",
        swap: swap("sw-n", "noor", ME_ID, "run-the-world", "Play this walking into your next thing you're nervous about. Trust me.", "returned"),
      },
      {
        id: "n4",
        fromUserId: ME_ID,
        sentAt: minutesAgo(60 * 23),
        kind: "swap",
        swap: swap("sw-n2", ME_ID, "noor", "holocene", "The opposite of yours. For after the thing, when it's over.", "pending"),
      },
    ],
  ],
  [
    "sam",
    [
      { id: "s1", fromUserId: "sam", sentAt: minutesAgo(180), kind: "text", text: "hey, the card said we both keep songs around for people we miss" },
      {
        id: "s2",
        fromUserId: "sam",
        sentAt: minutesAgo(178),
        kind: "swap",
        swap: swap("sw-s", "sam", ME_ID, "fourth-of-july", "This is the one I play for my grandma. Curious what yours is.", "pending"),
      },
    ],
  ],
];

export const conversations = new Map<string, Message[]>(seedConversations());

export function resetConversations() {
  conversations.clear();
  for (const [k, v] of seedConversations()) conversations.set(k, v);
}

const REPLIES: Record<ClusterId, string> = {
  quiet_company: "honestly yes. I can't do a silent apartment. what's yours right now?",
  armor_up: "ok I respect that. what are you gearing up for this week?",
  carrying_loss: "that means a lot, thank you for sharing it",
  somewhere_else: "I needed that kind of escape today, I'll put it on tonight",
  old_selves: "wait that's such a specific year for me too",
};

/** Schedules a single canned reply so a live demo chat feels alive. */
export function scheduleReply(userId: string) {
  const list = conversations.get(userId) ?? [];
  if (list.some((m) => m.id.startsWith("reply-"))) return;
  const u = worldUser(userId);
  list.push({
    id: `reply-${userId}`,
    fromUserId: userId,
    sentAt: new Date(Date.now() + 2600).toISOString(),
    kind: "text",
    text: REPLIES[u?.primary ?? "quiet_company"],
  });
  conversations.set(userId, list);
}

export { primaryCluster };
