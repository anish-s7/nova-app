"use client";

/**
 * View functions for real data: the same signatures as the mock ones in lib/api.ts, built from
 * the route handlers via lib/http-db.ts. lib/api.ts delegates here when REAL_DATA is on.
 *
 * "me" is ALWAYS the alias ME_ID at this boundary (nodes, edges, messages, listeners), never the
 * signed-in user's uuid, so components keep comparing against ME_ID like they do with the mock.
 * Fields the contract can't supply stay empty and are marked NOT IN CONTRACT.
 */

import { ApiError } from "./api-error";
import { CLUSTER_IDS, getCluster, type ClusterId } from "./clusters";
import type { ClusterDetail, ClusterSong } from "./cluster-songs";
import { fetchProfile, forgetMe, getMyId, httpDb } from "./http-db";
import { ME_ID } from "./mock-world";
import type { SongLayer, SongListener, SongStar } from "./song-layer";
import type {
  Connection,
  ConnectionCard,
  ConnectionCardJson,
  ContrastCard,
  Conversation,
  ConversationSummary,
  GalaxyEdge,
  Message,
  MessageRow,
  Song,
  SongRow,
  User,
  WanderEntry,
} from "./types";

const DEFAULT_CLUSTER = "quiet_company";

// --- small mappers ----------------------------------------------------------

function toSong(row: Pick<SongRow, "id" | "title" | "artist" | "album_art_url" | "spotify_track_id">): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    albumArtUrl: row.album_art_url ?? undefined,
    spotifyId: row.spotify_track_id ?? undefined,
    source: row.spotify_track_id ? "spotify" : "manual",
  };
}

const key = (s: { title: string; artist: string }) => `${s.title}::${s.artist}`.toLowerCase();

/** Catalog rows aren't deduped across MusicBrainz ids yet (CLAUDE.md backburner #1), so compare by id or by title + artist. */
function overlap(mine: Song[], theirs: Song[]) {
  const ids = new Set(mine.map((s) => s.id));
  const keys = new Set(mine.map(key));
  const sharedSongs = theirs.filter((s) => ids.has(s.id) || keys.has(key(s))).length;
  const artists = new Set(mine.map((s) => s.artist.toLowerCase()));
  const sharedArtists = new Set(theirs.filter((s) => artists.has(s.artist.toLowerCase())).map((s) => s.artist.toLowerCase())).size;
  return { sharedSongs, sharedArtists };
}

/** Their songs that overlap with mine: same song first, then same artist. */
function evidenceSongs(mine: Song[], theirs: Song[], max = 4): Song[] {
  const keys = new Set(mine.map(key));
  const artists = new Set(mine.map((s) => s.artist.toLowerCase()));
  const same = theirs.filter((s) => keys.has(key(s)));
  const sameArtist = theirs.filter((s) => !keys.has(key(s)) && artists.has(s.artist.toLowerCase()));
  return [...same, ...sameArtist].slice(0, max);
}

async function picksOf(id: string): Promise<Song[]> {
  return (await httpDb.listPicks(id)).map((p) => toSong(p.song));
}

function messageFromRow(row: MessageRow, myId: string): Message {
  return { id: row.id, fromUserId: row.sender_id === myId ? ME_ID : row.sender_id, sentAt: row.created_at, kind: "text", text: row.body };
}

/** Best guess at which pick a piece of card evidence is talking about: the one whose title it mentions. */
function songMentioned(text: string, songs: Song[]): Song | undefined {
  const t = text.toLowerCase();
  return songs.find((s) => s.title.length > 2 && t.includes(s.title.toLowerCase()));
}

const placeholderSong = (title: string, artist: string): Song => ({ id: `${title}-${artist}`, title, artist, source: "manual" });

// Similarity to me by person, remembered from the galaxy/matches so the person sheet can show it.
const similarityOf = new Map<string, number>();
export function rememberSimilarities(edges: GalaxyEdge[]) {
  for (const e of edges) {
    if (e.source === ME_ID) similarityOf.set(e.target, e.similarity);
    else if (e.target === ME_ID) similarityOf.set(e.source, e.similarity);
  }
}

// --- people ---------------------------------------------------------------

export async function getMe(): Promise<User & { cluster: string }> {
  const { profile, picks } = await fetchProfile("me");
  return {
    id: profile.id,
    name: profile.display_name,
    songs: picks.flatMap((p) => (p.songs ? [toSong(p.songs)] : [])),
    motivations: [], // NOT IN CONTRACT (lib/types.ts #4)
    cluster: profile.primary_cluster ?? DEFAULT_CLUSTER,
  };
}

export async function getUser(id: string): Promise<User & { cluster: string; edge: GalaxyEdge }> {
  const [{ profile, picks }, mine] = await Promise.all([fetchProfile(id), picksOf("me")]);
  const songs = picks.flatMap((p) => (p.songs ? [toSong(p.songs)] : []));
  return {
    id: profile.id,
    name: profile.display_name,
    songs,
    motivations: [], // NOT IN CONTRACT
    cluster: profile.primary_cluster ?? DEFAULT_CLUSTER,
    edge: { source: ME_ID, target: id, similarity: similarityOf.get(id) ?? 0, sharedMotivation: "", ...overlap(mine, songs) },
  };
}

export async function getConnections(): Promise<Connection[]> {
  const [matches, mine] = await Promise.all([httpDb.getMatches(14), picksOf("me")]);
  return matches.map((m) => {
    const theirs = (m.songs ?? []).map((s) => toSong({ ...s, spotify_track_id: null }));
    const o = overlap(mine, theirs);
    if (m.similarity !== undefined) similarityOf.set(m.profileId, m.similarity);
    return {
      user: { id: m.profileId, name: m.displayName },
      cluster: m.cluster ?? DEFAULT_CLUSTER,
      similarity: m.similarity ?? 0,
      sharedMotivation: m.card.shared_why,
      ...o,
      evidenceSongs: evidenceSongs(mine, theirs),
    };
  });
}

// --- cards ------------------------------------------------------------------

/** Cached card, else generate one. "Not enough evidence" is a normal outcome, shown as a message, not a crash. */
async function cardJsonFor(otherId: string): Promise<{ json: ConnectionCardJson; iAmA: boolean }> {
  const myId = await getMyId();
  const cached = await httpDb.getConnectionCard(otherId);
  if (cached) return { json: cached.card_json, iAmA: cached.user_a === myId };
  const generated = await httpDb.generateConnectionCard(otherId);
  if (generated.status !== "match") throw new ApiError("There isn't a strong enough thread between you two yet.");
  return { json: generated.card, iAmA: myId < otherId };
}

export async function getConnectionCard(otherId: string): Promise<ConnectionCard> {
  const [{ json, iAmA }, mine, theirs] = await Promise.all([cardJsonFor(otherId), picksOf("me"), picksOf(otherId)]);
  if (json.kind === "contrast") throw new ApiError("You two picked the same song but feel it differently. Find them in Wander.");
  const myText = iAmA ? json.evidence.user_a : json.evidence.user_b;
  const theirText = iAmA ? json.evidence.user_b : json.evidence.user_a;
  const shared = mine.filter((s) => theirs.some((t) => key(t) === key(s)));
  const fallback = (list: Song[]) => shared[0] ?? list[0] ?? placeholderSong("", "");
  return {
    userA: ME_ID,
    userB: otherId,
    overlap: overlap(mine, theirs),
    sharedMotivations: [
      {
        motivation: json.shared_why,
        evidenceA: { song: songMentioned(myText, mine) ?? fallback(mine), text: myText },
        evidenceB: { song: songMentioned(theirText, theirs) ?? fallback(theirs), text: theirText },
      },
    ],
    meaningfulDifference: { summary: json.difference, evidenceA: "", evidenceB: "" }, // per-side detail NOT IN CONTRACT
    suggestedOpeners: json.openers,
  };
}

function contrastFrom(json: ConnectionCardJson, iAmA: boolean, otherId: string, mine: Song[]): ContrastCard {
  if (json.kind !== "contrast" || !json.shared_song) throw new ApiError("That card isn't a contrast card.");
  const shared = json.shared_song;
  return {
    userA: ME_ID,
    userB: otherId,
    // Both of us picked it, so my own pick has the cover.
    song: mine.find((s) => key(s) === key(shared)) ?? placeholderSong(shared.title, shared.artist),
    sharedThread: json.shared_why,
    feelA: iAmA ? json.evidence.user_a : json.evidence.user_b,
    feelB: iAmA ? json.evidence.user_b : json.evidence.user_a,
    difference: json.difference,
    suggestedOpeners: json.openers,
    swapPrompt: json.suggested_swap_prompt,
  };
}

export async function getWander(): Promise<WanderEntry[]> {
  const [myId, rows, mine] = await Promise.all([getMyId(), httpDb.wander(), picksOf("me")]);
  return Promise.all(
    rows.map(async (r) => {
      const cluster = await fetchProfile(r.profile_id).then((p) => p.profile.primary_cluster ?? DEFAULT_CLUSTER, () => DEFAULT_CLUSTER);
      return { user: { id: r.profile_id, name: r.display_name, cluster }, card: contrastFrom(r.card.card_json, r.card.user_a === myId, r.profile_id, mine) };
    }),
  );
}

export async function getContrastCard(otherId: string): Promise<ContrastCard> {
  const [myId, row, mine] = await Promise.all([getMyId(), httpDb.getConnectionCard(otherId), picksOf("me")]);
  if (!row) throw new ApiError("That card hasn't been made yet. Try Wander again.");
  return contrastFrom(row.card_json, row.user_a === myId, otherId, mine);
}

// --- messages -----------------------------------------------------------------

export async function getConversations(): Promise<ConversationSummary[]> {
  const myId = await getMyId();
  const rows = await httpDb.listMessages(myId);
  const threads = new Map<string, Message[]>();
  for (const r of rows) {
    const other = r.user_a === myId ? r.user_b : r.user_a;
    threads.set(other, [...(threads.get(other) ?? []), messageFromRow(r, myId)]);
  }
  const summaries = await Promise.all(
    [...threads].map(async ([userId, msgs]): Promise<ConversationSummary[]> => {
      try {
        const { profile } = await fetchProfile(userId);
        return [{ userId, name: profile.display_name, cluster: profile.primary_cluster ?? DEFAULT_CLUSTER, lastMessage: msgs.at(-1), threadSongs: 0 }];
      } catch (err) {
        console.error(`getConversations: skipping ${userId}`, err);
        return [];
      }
    }),
  );
  return summaries.flat().sort((a, b) => (b.lastMessage?.sentAt ?? "").localeCompare(a.lastMessage?.sentAt ?? ""));
}

export async function getConversation(userId: string): Promise<Conversation> {
  const myId = await getMyId();
  const [{ profile }, rows, card] = await Promise.all([
    fetchProfile(userId),
    httpDb.listMessages(myId, userId),
    httpDb.getConnectionCard(userId).catch((err) => {
      console.error("getConversation: card lookup failed", err);
      return null;
    }),
  ]);
  const match = card && card.card_json.kind !== "contrast" ? card.card_json : undefined;
  return {
    user: { id: profile.id, name: profile.display_name },
    cluster: profile.primary_cluster ?? DEFAULT_CLUSTER,
    sharedMotivation: match?.shared_why,
    messages: rows.map((r) => messageFromRow(r, myId)),
    suggestedOpeners: match?.openers ?? [],
  };
}

export async function sendMessage(userId: string, text: string): Promise<Message> {
  const [myId, row] = await Promise.all([getMyId(), httpDb.insertMessage({ otherProfileId: userId, text })]);
  return messageFromRow(row, myId);
}

/** No swap table yet (backburner #3), so a swap goes out as a plain message the other person can read. */
export function sendSongSwap(userId: string, song: Song, reason: string): Promise<Message> {
  return sendMessage(userId, `Song swap: “${song.title}” by ${song.artist}${reason ? ` — ${reason}` : ""}`);
}

// --- song layer + cluster detail ----------------------------------------------------

type SongsResponse = {
  meId: string;
  people: { id: string; name: string; cluster: string }[];
  songs: {
    id: string;
    title: string;
    artist: string;
    albumArtUrl: string | null;
    spotifyId: string | null;
    meaning: string | null;
    listeners: { id: string; name: string; isMe: boolean; reason: string; daysAgo: number; why: string }[];
  }[];
};

const NEW_WITHIN_DAYS = 7;

async function fetchSongs(): Promise<SongsResponse> {
  const res = await fetch("/api/galaxy/songs", { credentials: "same-origin" });
  if (!res.ok) throw new ApiError(res.status === 401 ? "Sign in to see songs." : "The songs didn't load.");
  return res.json() as Promise<SongsResponse>;
}

const asCluster = (c: string): ClusterId => (CLUSTER_IDS.includes(c as ClusterId) ? (c as ClusterId) : DEFAULT_CLUSTER);
const songOf = (s: SongsResponse["songs"][number]): Song =>
  toSong({ id: s.id, title: s.title, artist: s.artist, album_art_url: s.albumArtUrl, spotify_track_id: s.spotifyId });

export async function getSongLayer(): Promise<SongLayer> {
  const data = await fetchSongs();
  const myCluster = asCluster(data.people.find((p) => p.id === data.meId)?.cluster ?? DEFAULT_CLUSTER);

  const stars: SongStar[] = data.songs.map((s) => {
    const listeners: SongListener[] = s.listeners
      .map((l) => ({ id: l.isMe ? ME_ID : l.id, name: l.name, isMe: l.isMe, reason: l.reason, daysAgo: l.daysAgo, why: asCluster(l.why) }))
      .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.daysAgo - b.daysAgo);
    const counts = new Map<ClusterId, number>();
    for (const l of listeners) counts.set(l.why, (counts.get(l.why) ?? 0) + 1);
    const whyCounts = [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
    return {
      id: s.id,
      song: songOf(s),
      meaning: s.meaning ?? "",
      cluster: whyCounts[0]?.id ?? myCluster,
      listeners,
      whyCounts,
      isBridge: listeners.length >= 2 && whyCounts.length >= 2,
      myWhy: listeners.find((l) => l.isMe)?.why ?? myCluster,
      themes: [], // NOT IN CONTRACT: themes are mock-only
      weight: listeners.length,
      isNew: listeners.some((l) => l.daysAgo <= NEW_WITHIN_DAYS),
    };
  });
  stars.sort((a, b) => b.weight - a.weight || a.song.title.localeCompare(b.song.title));
  return { stars, themes: [] };
}

export async function getClusterDetail(id: string): Promise<ClusterDetail> {
  const data = await fetchSongs();
  const cluster = getCluster(id);
  const members = new Set(data.people.filter((p) => asCluster(p.cluster) === cluster.id).map((p) => p.id));

  const songs: ClusterSong[] = data.songs
    .flatMap((s): ClusterSong[] => {
      const inCluster = s.listeners.filter((l) => members.has(l.id));
      if (!inCluster.length) return [];
      const listeners = inCluster
        .map((l) => ({ id: l.isMe ? ME_ID : l.id, name: l.name, isMe: l.isMe, reason: l.reason, daysAgo: l.daysAgo }))
        .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.daysAgo - b.daysAgo);
      return [{ song: songOf(s), meaning: s.meaning ?? "", listeners, mine: listeners.some((l) => l.isMe), isNew: listeners.some((l) => l.daysAgo <= NEW_WITHIN_DAYS) }];
    })
    .sort((a, b) => Number(b.mine) - Number(a.mine) || b.listeners.length - a.listeners.length || a.song.title.localeCompare(b.song.title));

  return { id: cluster.id, label: cluster.label, listeners: members.size, songCount: songs.length, newThisWeek: songs.filter((s) => s.isNew).length, songs };
}

/** Sign-in/out: drop anything cached about who "me" is. */
export function resetRealWorld() {
  forgetMe();
  similarityOf.clear();
}
