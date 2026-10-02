"use client";

/**
 * View functions for real data: the same signatures as the mock ones in lib/data/api.ts, built from
 * the route handlers via lib/data/http-db.ts. lib/data/api.ts delegates here when REAL_DATA is on.
 *
 * "me" is ALWAYS the alias ME_ID at this boundary (nodes, edges, messages, listeners), never the
 * signed-in user's uuid, so components keep comparing against ME_ID like they do with the mock.
 * Fields the contract can't supply stay empty and are marked NOT IN CONTRACT.
 */

import { ApiError } from "./api-error";
import type { AvatarInfo, Face } from "../avatar/avatar";
import { squarePhoto } from "../avatar/avatar-photo";
import { forgetAvatars, getKnownAvatar, setAvatar } from "../avatar/avatar-store";
import { getCluster } from "../galaxy/clusters";
import type { ClusterDetail, ClusterSong } from "../galaxy/cluster-songs";
import { cached, fetchProfile, forgetMe, generatePortrait, getMyId, getPortrait, httpDb } from "./http-db";
import { registerSong } from "../music/music-context";
import { ME_ID } from "./mock-world";
import type { Portrait } from "../portrait";
import type { SongLayer, SongListener, SongStar } from "../galaxy/song-layer";
import { threadFrom } from "../thread";
import type {
  AnalysisResult,
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
  SongSnippet,
  SongSwapPayloadV1,
  SongRow,
  User,
  WanderEntry,
} from "./types";
import type { DiscoveryMode, DiscoverySongDto } from "../discovery/types";

const DEFAULT_CLUSTER = "quiet_company";

export type DiscoveryView = {
  status: "ready" | "not_ready";
  batchId: string | null;
  snapshotId: string | null;
  feedbackRevision: number;
  mode: DiscoveryMode;
  expiresAt: string | null;
  songs: DiscoverySongDto[];
};

export async function getDiscovery(anchorSongId: string, mode: DiscoveryMode): Promise<DiscoveryView> {
  const params = new URLSearchParams({ anchorSongId, mode });
  const response = await fetch(`/api/discovery?${params}`, { credentials: "same-origin" });
  if (!response.ok) throw new ApiError(response.status === 404 ? "Discovery is not available yet." : "Discoveries didn't load.");
  return response.json() as Promise<DiscoveryView>;
}

export async function sendDiscoveryFeedback(candidateId: string, action: "save" | "dismiss" | "not_now" | "more_like" | "hide_artist") {
  const response = await fetch("/api/discovery/feedback", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ candidateId, action, clientIdempotencyKey: crypto.randomUUID() }),
  });
  const body = await response.json().catch(() => ({})) as { error?: string; feedbackRevision?: number };
  if (!response.ok) throw new ApiError(body.error ?? "That feedback didn't save.");
  return body;
}

// --- small mappers ----------------------------------------------------------

function toSong(row: Pick<SongRow, "id" | "title" | "artist" | "album_art_url" | "spotify_track_id">): Song {
  const song: Song = {
    id: row.id,
    title: row.title,
    artist: row.artist,
    albumArtUrl: row.album_art_url ?? undefined,
    spotifyId: row.spotify_track_id ?? undefined,
    source: row.spotify_track_id ? "spotify" : "manual",
  };
  registerSong(song);
  return song;
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
  if (row.kind === "song_swap" && row.payload?.version === 1) {
    const p = row.payload;
    const id = p.song.catalogId ?? (p.song.provider && p.song.providerTrackId ? `${p.song.provider}:${p.song.providerTrackId}` : `swap:${row.id}`);
    return {
      id: row.id,
      fromUserId: row.sender_id === myId ? ME_ID : row.sender_id,
      sentAt: row.created_at,
      kind: "swap",
      swap: {
        id: row.id,
        fromUserId: row.sender_id === myId ? ME_ID : row.sender_id,
        toUserId: row.sender_id === row.user_a ? row.user_b : row.user_a,
        song: { id, title: p.song.title, artist: p.song.artist, albumArtUrl: p.song.albumArtUrl, source: "manual" },
        reason: p.reason,
        status: "pending",
        snippet: p.snippet,
        replyToMessageId: p.replyToMessageId,
      },
    };
  }
  return { id: row.id, fromUserId: row.sender_id === myId ? ME_ID : row.sender_id, sentAt: row.created_at, kind: "text", text: row.body };
}

function messagesFromRows(rows: MessageRow[], myId: string): Message[] {
  const returned = new Set(rows.flatMap((r) => (r.kind === "song_swap" && r.payload?.replyToMessageId ? [r.payload.replyToMessageId] : [])));
  return rows.map((row) => {
    const message = messageFromRow(row, myId);
    return message.kind === "swap" && returned.has(message.id) ? { ...message, swap: { ...message.swap, status: "returned" as const } } : message;
  });
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

// --- song search ------------------------------------------------

type SearchSong = { id: string; title: string; artist: string; albumArtUrl: string | null; previewUrl: string | null };

/** Real catalog search and empty-query discovery (GET /api/songs/search). */
export async function searchSongs(q: string): Promise<Song[]> {
  const query = q.trim();
  if (query.length === 1) return [];
  const path = query ? `/api/songs/search?q=${encodeURIComponent(query)}` : "/api/songs/search";
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) throw new ApiError(res.status === 401 ? "Sign in to search." : "Song search isn't responding right now.");
  const { songs } = (await res.json()) as { songs: SearchSong[] };
  return songs.map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    albumArtUrl: s.albumArtUrl ?? undefined,
    previewUrl: s.previewUrl ?? undefined,
    source: "manual" as const,
  }));
}

/** Where the empty-search suggestions came from: people here ("community") or the charts. */
export type Discovery = { songs: Song[]; source: "community" | "chart" };

/** Songs to suggest before anything is typed (GET /api/songs/search with no query). */
export async function discoverSongs(): Promise<Discovery> {
  const res = await fetch("/api/songs/search", { credentials: "same-origin" });
  if (!res.ok) throw new ApiError(res.status === 401 ? "Sign in to search." : "Song suggestions aren't loading right now.");
  const { songs, source } = (await res.json()) as { songs: SearchSong[]; source?: Discovery["source"] };
  return {
    source: source ?? "chart",
    songs: songs.map((s) => ({ id: s.id, title: s.title, artist: s.artist, albumArtUrl: s.albumArtUrl ?? undefined, previewUrl: s.previewUrl ?? undefined, source: "manual" as const })),
  };
}

// --- listening portrait ----------------------------------------------------------

const looseTitle = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** The stored portrait in the why/me screens' shape. Song titles become my real pick ids. */
function analysisFrom(portrait: Portrait, mine: Song[]): AnalysisResult {
  const idOf = new Map(mine.map((s) => [looseTitle(s.title), s.id]));
  return {
    headline: portrait.headline,
    highlights: portrait.highlights,
    motivations: portrait.motivations.map((m, i) => ({
      id: `portrait-${i}-${m.cluster}`,
      label: m.label,
      description: m.description,
      cluster: m.cluster,
      confidence: m.confidence,
      evidence: m.evidence.map((e) => ({
        kind: "song_context" as const,
        text: e.text,
        songIds: e.songTitles.flatMap((t) => idOf.get(looseTitle(t)) ?? []),
      })),
      feedback: "unreviewed" as const,
      isPublic: true,
    })),
  };
}

/** Regenerates my portrait from my saved picks (one Gemini call, skipped server-side if nothing changed). */
export async function generateAnalysis(): Promise<AnalysisResult> {
  const [{ portrait }, mine] = await Promise.all([generatePortrait(), picksOf("me")]);
  return analysisFrom(portrait, mine);
}

/** My stored portrait, or null if there isn't one yet. No Gemini call. */
export async function getStoredAnalysis(): Promise<AnalysisResult | null> {
  const [stored, mine] = await Promise.all([getPortrait(), picksOf("me")]);
  return stored ? analysisFrom(stored, mine) : null;
}

// --- people ---------------------------------------------------------------

export async function getMe(): Promise<User & { cluster: string }> {
  const { profile, picks } = await fetchProfile("me");
  return {
    id: profile.id,
    name: profile.display_name,
    songs: picks.flatMap((p) => (p.songs ? [toSong(p.songs)] : [])),
    motivations: [], // NOT IN CONTRACT (lib/data/types.ts #4)
    cluster: profile.primary_cluster ?? DEFAULT_CLUSTER,
  };
}

/**
 * Feeling tags that appear on both people's songs, most used (across both) first. People are
 * linked by how their songs feel to them, not by picking the same songs, so this is usually the
 * real common ground.
 */
function sharedFeelings(mine: { tags: string[] }[], theirs: { tags: string[] }[], max = 3): string[] {
  const count = (picks: { tags: string[] }[]) => {
    const c = new Map<string, number>();
    for (const p of picks) for (const t of p.tags) c.set(t, (c.get(t) ?? 0) + 1);
    return c;
  };
  const a = count(mine);
  const b = count(theirs);
  return [...a.keys()]
    .filter((t) => b.has(t))
    .sort((x, y) => a.get(y)! + b.get(y)! - (a.get(x)! + b.get(x)!))
    .slice(0, max);
}

export async function getUser(id: string): Promise<User & { cluster: string; edge: GalaxyEdge }> {
  const [{ profile, picks }, me] = await Promise.all([fetchProfile(id), fetchProfile("me")]);
  const songs = picks.flatMap((p) => (p.songs ? [toSong(p.songs)] : []));
  const mine = me.picks.flatMap((p) => (p.songs ? [toSong(p.songs)] : []));
  return {
    id: profile.id,
    name: profile.display_name,
    songs,
    motivations: [], // NOT IN CONTRACT
    cluster: profile.primary_cluster ?? DEFAULT_CLUSTER,
    edge: {
      source: ME_ID,
      target: id,
      similarity: similarityOf.get(id) ?? 0,
      sharedMotivation: "",
      ...overlap(mine, songs),
      sharedFeelings: sharedFeelings(me.picks, picks),
    },
  };
}

export async function getConnections(): Promise<Connection[]> {
  const [matches, mine] = await Promise.all([httpDb.getMatches(14), picksOf("me")]);
  return matches.map((m) => {
    const theirs = (m.songs ?? []).map((s) => toSong({ ...s, spotify_track_id: null }));
    const o = overlap(mine, theirs);
    // The AI's whole-profile score is the number people see; cosine similarity is only the pre-filter.
    const similarity = typeof m.score === "number" ? m.score / 100 : (m.similarity ?? 0);
    similarityOf.set(m.profileId, similarity);
    return {
      user: { id: m.profileId, name: m.displayName },
      cluster: m.cluster ?? DEFAULT_CLUSTER,
      similarity,
      sharedMotivation: m.card.shared_why,
      threadWhy: m.card.threads?.[0]?.why,
      ...o,
      evidenceSongs: evidenceSongs(mine, theirs),
    };
  });
}

// --- cards ------------------------------------------------------------------

/**
 * The pair's card in one request: POST /api/cards returns the saved card, or assesses the pair (a
 * Gemini call, ~2-3s) and saves one. Shared through the read cache, so a warm-up started by
 * prefetchConnectionCard and the card screen itself use the same request. "Not enough evidence" is a
 * normal outcome, shown as a message, not a crash (and not cached here; the server remembers it).
 */
const CARD_JSON_TTL_MS = 60_000;

function cardJsonFor(otherId: string): Promise<{ json: ConnectionCardJson; iAmA: boolean }> {
  return cached(`cardjson:${otherId}`, CARD_JSON_TTL_MS, async () => {
    const [myId, res] = await Promise.all([getMyId(), httpDb.generateConnectionCard(otherId)]);
    if (res.status !== "match") throw new ApiError("There isn't a strong enough thread between you two yet.");
    // Row order: user_a is the smaller id (alignCardEvidence).
    return { json: res.card, iAmA: myId < otherId };
  });
}

/**
 * Starts building the card for someone before their card is opened (their profile or galaxy sheet is
 * showing), so "What you share" usually opens on a finished card. Costs at most one Gemini call per
 * pair: saved cards and remembered rejections come back without one.
 */
export function prefetchConnectionCard(otherId: string) {
  // Not a match, or it failed: the card screen asks again and shows its own message.
  void cardJsonFor(otherId).catch((err) => console.info(`Card warm-up for ${otherId} didn't produce a card:`, err instanceof Error ? err.message : err));
}

export async function getConnectionCard(otherId: string): Promise<ConnectionCard> {
  const [{ json, iAmA }, mine, theirs] = await Promise.all([cardJsonFor(otherId), picksOf("me"), picksOf(otherId)]);
  if (json.kind === "contrast") throw new ApiError("You two picked the same song but feel it differently. Find them in Wander.");
  const myText = iAmA ? json.evidence.user_a : json.evidence.user_b;
  const theirText = iAmA ? json.evidence.user_b : json.evidence.user_a;
  const shared = mine.filter((s) => theirs.some((t) => key(t) === key(s)));
  const fallback = (list: Song[]) => shared[0] ?? list[0] ?? placeholderSong("", "");
  const byTitle = (list: Song[], ref: { title: string; artist: string }) =>
    list.find((s) => key(s) === key(ref)) ?? list.find((s) => looseTitle(s.title) === looseTitle(ref.title)) ?? placeholderSong(ref.title, ref.artist);
  // Whole-profile cards carry 1–2 threads, each anchored by a real song on each side. Older cards
  // have one shared_why, so fall back to guessing the song from the evidence text.
  const sharedMotivations = json.threads?.length
    ? json.threads.map((t) => ({
        motivation: t.why,
        evidenceA: { song: byTitle(mine, iAmA ? t.song_a : t.song_b), text: iAmA ? t.evidence_a : t.evidence_b },
        evidenceB: { song: byTitle(theirs, iAmA ? t.song_b : t.song_a), text: iAmA ? t.evidence_b : t.evidence_a },
      }))
    : [
        {
          motivation: json.shared_why,
          evidenceA: { song: songMentioned(myText, mine) ?? fallback(mine), text: myText },
          evidenceB: { song: songMentioned(theirText, theirs) ?? fallback(theirs), text: theirText },
        },
      ];
  return {
    userA: ME_ID,
    userB: otherId,
    overlap: overlap(mine, theirs),
    sharedMotivations,
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
  const threads = new Map<string, MessageRow[]>();
  for (const r of rows) {
    const other = r.user_a === myId ? r.user_b : r.user_a;
    threads.set(other, [...(threads.get(other) ?? []), r]);
  }
  const mappedThreads = new Map([...threads].map(([other, threadRows]) => [other, messagesFromRows(threadRows, myId)]));
  const summaries = await Promise.all(
    [...mappedThreads].map(async ([userId, msgs]): Promise<ConversationSummary[]> => {
      try {
        const { profile } = await fetchProfile(userId);
        const thread = threadFrom(msgs, ME_ID);
        return [{ userId, name: profile.display_name, cluster: profile.primary_cluster ?? DEFAULT_CLUSTER, lastMessage: msgs.at(-1), threadSongs: thread.entries.length, turn: thread.turn }];
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
    messages: messagesFromRows(rows, myId),
    suggestedOpeners: match?.openers ?? [],
  };
}

export async function sendMessage(userId: string, text: string): Promise<Message> {
  const [myId, row] = await Promise.all([getMyId(), httpDb.insertMessage({ otherProfileId: userId, text })]);
  return messageFromRow(row, myId);
}

/** Structured Song Swap message. Audio URLs stay transient; only stable identity and timing persist. */
export async function sendSongSwap(userId: string, song: Song, reason: string, replyToMessageId?: string, snippet?: SongSnippet): Promise<Message> {
  const providerMatch = /^(deezer|itunes):(\d+)$/.exec(song.id);
  const catalogId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(song.id) ? song.id : undefined;
  const payload: SongSwapPayloadV1 = {
    version: 1,
    song: {
      ...(catalogId ? { catalogId } : {}),
      ...(providerMatch ? { provider: providerMatch[1] as "deezer" | "itunes", providerTrackId: providerMatch[2] } : {}),
      title: song.title,
      artist: song.artist,
      ...(song.albumArtUrl ? { albumArtUrl: song.albumArtUrl } : {}),
    },
    reason,
    ...(snippet ? { snippet } : {}),
    ...(replyToMessageId ? { replyToMessageId } : {}),
  };
  const [myId, row] = await Promise.all([getMyId(), httpDb.insertMessage({ otherProfileId: userId, kind: "song_swap", payload })]);
  return messageFromRow(row, myId);
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

/** Shared by the song layer and every cluster sheet opened soon after; cleared when my picks change. */
const SONGS_TTL_MS = 30_000;

function fetchSongs(): Promise<SongsResponse> {
  return cached("galaxy-songs", SONGS_TTL_MS, async () => {
    const res = await fetch("/api/galaxy/songs", { credentials: "same-origin" });
    if (!res.ok) throw new ApiError(res.status === 401 ? "Sign in to see songs." : "The songs didn't load.");
    return res.json() as Promise<SongsResponse>;
  });
}

const songOf = (s: SongsResponse["songs"][number]): Song =>
  toSong({ id: s.id, title: s.title, artist: s.artist, album_art_url: s.albumArtUrl, spotify_track_id: s.spotifyId });

export async function getSongLayer(): Promise<SongLayer> {
  const data = await fetchSongs();
  const myCluster = data.people.find((p) => p.id === data.meId)?.cluster ?? DEFAULT_CLUSTER;

  const stars: SongStar[] = data.songs.map((s) => {
    const listeners: SongListener[] = s.listeners
      .map((l) => ({ id: l.isMe ? ME_ID : l.id, name: l.name, isMe: l.isMe, reason: l.reason, daysAgo: l.daysAgo, why: l.why }))
      .sort((a, b) => Number(b.isMe) - Number(a.isMe) || a.daysAgo - b.daysAgo);
    const counts = new Map<string, number>();
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
  const members = new Set(data.people.filter((p) => p.cluster === cluster.id).map((p) => p.id));

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

// --- profile icon -----------------------------------------------------------------

async function avatarRequest<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", ...init });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new ApiError(res.status === 401 ? "Sign in to continue." : (body?.error ?? "That didn't save. Try again."));
  return body;
}

/** Shows my new icon everywhere right away (under "me" and my real id). */
async function showMine(patch: Partial<AvatarInfo>) {
  const current = getKnownAvatar("me") ?? { face: null, photoUrl: null };
  setAvatar(["me", await getMyId()], { ...current, ...patch });
}

/** Saves my illustrated face (null: back to the one generated from my name). */
export async function saveAvatarFace(face: Face | null) {
  await avatarRequest("/api/avatar", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ face }) });
  await showMine({ face });
}

/** Uploads a photo (resized and cropped first); it replaces my face everywhere. Returns its URL. */
export async function uploadAvatarPhoto(file: File): Promise<string> {
  const form = new FormData();
  form.append("photo", await squarePhoto(file), "avatar.jpg");
  const { photoUrl } = await avatarRequest<{ photoUrl: string }>("/api/avatar/photo", { method: "POST", body: form });
  await showMine({ photoUrl });
  return photoUrl;
}

export async function removeAvatarPhoto() {
  await avatarRequest("/api/avatar/photo", { method: "DELETE" });
  await showMine({ photoUrl: null });
}

/** Sign-in/out: drop anything cached about who "me" is. */
export function resetRealWorld() {
  forgetMe();
  forgetAvatars();
  similarityOf.clear();
}
