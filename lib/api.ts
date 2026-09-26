"use client";

/**
 * The frontend's one data-access seam. Pages, components and hooks import data from
 * here and nowhere else; nothing outside lib/ imports mock-world or mock-db.
 *
 * Two layers:
 *   1. `db`: row-level reads/writes typed field-for-field against db/contract.md (the
 *      "DB contract rows" section of lib/types.ts). This is the swap point below.
 *   2. The exported functions: view shapes for the UI. Their signatures don't change at
 *      merge time. They build views from `db` rows, plus mock-only enrichment for fields
 *      the contract doesn't have yet (every such spot is marked NOT IN CONTRACT).
 *
 * MERGE_CHECKLIST.md lists exactly which bodies in this file change when the backend lands.
 */

import { getCluster } from "./clusters";
import { infer, primaryCluster } from "./inference";
import { mockDb } from "./mock-db";
import { SONG_CATALOG, songById } from "./music-context";
import {
  DEMO_BIAS,
  DEMO_MATCH_IDS,
  ME_ID,
  WORLD,
  buildArrival,
  buildConnectionCard,
  buildEdges,
  conversations,
  edgeBetween,
  lookupUser,
  meParty,
  myMotivations,
  myPrimaryCluster,
  overlap,
  partyFromWorld,
  resetWorld as resetMockWorld,
  scheduleReply,
  synthesizeSignals,
  worldUser,
  type Party,
} from "./mock-world";
import { getSession, setSession, type FailureKey } from "./session";
import type {
  AnalysisResult,
  Connection,
  ConnectionCard,
  ConnectionCardRow,
  Conversation,
  ConversationSummary,
  Db,
  GalaxyEdge,
  GalaxyNode,
  GalaxyResponse,
  InferredMotivation,
  ListeningSignal,
  Message,
  MessageRow,
  Song,
  SongRow,
  SpotifyImport,
  User,
} from "./types";

// ===========================================================================
// SWAP POINT: the only line that decides mock vs real data.
const db: Db = mockDb;
// ===========================================================================

export { ME_ID };

export class ApiError extends Error {
  constructor(
    message: string,
    public code: "unavailable" | "failed" = "failed",
  ) {
    super(message);
  }
}

/** Mock-only latency so loading states are visible. */
function delay(ms: number) {
  const s = getSession();
  const scaled = s.demo ? ms * 0.6 : ms;
  return new Promise((r) => setTimeout(r, scaled + Math.random() * 200));
}

/** Mock-only failure injection, driven by ?fail= (components/session-sync.tsx). */
function maybeFail(key: FailureKey) {
  if (getSession().failures.includes(key)) {
    throw new ApiError(key === "spotify" ? "Spotify isn't responding right now." : "Something went wrong on our end.", key === "spotify" ? "unavailable" : "failed");
  }
}

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

// ---------------------------------------------------------------------------
// Row -> view mappers

const catalogArt = new Map(SONG_CATALOG.map((s) => [s.id, s.albumArtUrl]));

function songFromRow(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    albumArtUrl: catalogArt.get(row.id), // NOT IN CONTRACT: mock catalog art
    spotifyId: row.spotify_track_id ?? undefined,
    source: row.spotify_track_id ? "spotify" : "manual",
  };
}

function messageFromRow(row: MessageRow): Message {
  return { id: row.id, fromUserId: row.sender_id, sentAt: row.created_at, kind: "text", text: row.body };
}

/** `extra` supplies what card_json doesn't have: overlap, evidence songs, extra shared reasons. */
function cardFromRow(row: ConnectionCardRow, meId: string, extra: ConnectionCard): ConnectionCard {
  const cj = row.card_json;
  const iAmA = row.user_a === meId;
  const [first, ...rest] = extra.sharedMotivations;
  return {
    userA: meId,
    userB: iAmA ? row.user_b : row.user_a,
    overlap: extra.overlap, // NOT IN CONTRACT
    sharedMotivations: [
      {
        motivation: cj.shared_why,
        evidenceA: { song: first.evidenceA.song, text: iAmA ? cj.evidence.user_a : cj.evidence.user_b },
        evidenceB: { song: first.evidenceB.song, text: iAmA ? cj.evidence.user_b : cj.evidence.user_a },
      },
      ...rest, // NOT IN CONTRACT: card_json has a single shared_why
    ],
    meaningfulDifference: { ...extra.meaningfulDifference, summary: cj.difference }, // evidenceA/B NOT IN CONTRACT
    suggestedOpeners: cj.openers,
  };
}

function byTime(messages: Message[]) {
  return [...messages].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

// ---------------------------------------------------------------------------
// Onboarding. NOT IN CONTRACT: Spotify import, catalog search and analysis aren't DB reads.

export async function importSpotify(): Promise<SpotifyImport> {
  await delay(1600);
  maybeFail("spotify");
  const ids = [
    "motion-sickness", "liability", "holocene", "fourth-of-july", "night-we-met", "skinny-love",
    "nights", "space-song", "fix-you", "ribs", "white-ferrari", "seventeen",
    "casimir-pulaski-day", "landslide", "ivy", "heartbeats", "supercut", "dreams",
    "kilby-girl", "stick-season", "intro-xx", "gymnopedie", "hurt", "midnight-city",
  ];
  const songs: Song[] = ids.map((id) => ({ ...songById(id), source: "spotify" }));
  const signals = synthesizeSignals("me-spotify", songs, "quiet_company");
  return { songs, signals };
}

export async function searchSongs(q: string): Promise<Song[]> {
  await delay(180);
  const needle = q.trim().toLowerCase();
  if (!needle) return SONG_CATALOG.slice(0, 12);
  return SONG_CATALOG.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(needle)).slice(0, 20);
}

export async function analyzeMusic(input: { songs: Song[]; signals: ListeningSignal[] }): Promise<AnalysisResult> {
  await delay(1400);
  maybeFail("analysis");
  const s = getSession();
  return infer({ userId: ME_ID, subject: { isMe: true }, songs: input.songs, signals: input.signals, bias: s.demo ? DEMO_BIAS : undefined });
}

/**
 * Saves the user's songs. The session copy drives onboarding (reading/why screens); the
 * db insert is what reaches the backend. reason_text isn't collected yet (lib/types.ts #3).
 */
export async function saveSongs(input: { source: "spotify" | "manual"; songs: Song[]; signals: ListeningSignal[] }) {
  setSession({ source: input.source, songs: input.songs, signals: input.signals, analysis: undefined, motivations: [] }, true);
  await db.insertSongs(
    input.songs.map((s) => ({
      profile_id: ME_ID,
      title: s.title,
      artist: s.artist,
      spotify_track_id: s.source === "spotify" ? (s.spotifyId ?? null) : null,
      reason_text: "",
      is_public: true,
    })),
  );
}

/** NOT IN CONTRACT: motivations rows have no feedback/isPublic/note (lib/types.ts #4). */
export async function updateMotivation(id: string, patch: Partial<Pick<InferredMotivation, "feedback" | "isPublic" | "note">>) {
  await delay(120);
  let updated: InferredMotivation | undefined;
  setSession(
    (s) => ({
      motivations: s.motivations.map((m) => (m.id === id ? (updated = { ...m, ...patch }) : m)),
    }),
    true,
  );
  return updated;
}

// ---------------------------------------------------------------------------
// Galaxy. NOT IN CONTRACT: no all-pairs edges or clusters in the DB (lib/types.ts #5, #6).

function pickTopMatch(me: Party, edges: GalaxyEdge[]): string | undefined {
  const mine = edges.filter((e) => e.source === ME_ID || e.target === ME_ID);
  const other = (e: GalaxyEdge) => (e.source === ME_ID ? e.target : e.source);
  if (getSession().demo) {
    const curated = DEMO_MATCH_IDS.map(worldUser).find((u) => u && overlap(me.songs, u.songs).sharedSongs === 0 && overlap(me.songs, u.songs).sharedArtists === 0);
    if (curated) return curated.id;
  }
  const zero = mine.filter((e) => e.sharedSongs === 0).sort((a, b) => b.similarity - a.similarity);
  return zero[0] ? other(zero[0]) : mine.sort((a, b) => b.similarity - a.similarity)[0] && other(mine[0]);
}

function nodeFor(u: Party, isMe: boolean): GalaxyNode {
  const active = u.motivations.filter((m) => m.feedback !== "rejected" && (isMe || m.isPublic));
  return {
    userId: u.id,
    name: u.name,
    cluster: primaryCluster(u.motivations),
    topMotivations: active.slice(0, 3).map((m) => m.label),
    isMe,
  };
}

export async function getGalaxy(): Promise<GalaxyResponse> {
  await delay(700);
  maybeFail("galaxy");
  const me = meParty();
  const others = WORLD.map(partyFromWorld);
  const edges = buildEdges([me, ...others], 4, ME_ID);
  const topMatchId = pickTopMatch(me, edges);

  if (topMatchId) {
    const u = worldUser(topMatchId)!;
    let edge = edges.find((e) => (e.source === ME_ID && e.target === topMatchId) || (e.target === ME_ID && e.source === topMatchId));
    if (!edge) {
      edge = edgeBetween(me, partyFromWorld(u));
      edges.push(edge);
    }
    if (getSession().demo) edge.similarity = Math.max(edge.similarity, 0.96);
  }

  return {
    nodes: [nodeFor(me, true), ...others.map((o) => nodeFor(o, false))],
    edges,
    topMatchId,
    status: "ready",
  };
}

/**
 * Simulated realtime: a new user joins shortly after the galaxy opens. Read by
 * hooks/use-galaxy-realtime.ts. Synchronous only because it's mock; see MERGE_CHECKLIST.md.
 */
export function getArrival(): { node: GalaxyNode; edges: GalaxyEdge[] } {
  const me = meParty();
  const arrival = buildArrival(myPrimaryCluster());
  const p = partyFromWorld(arrival);
  const edges = [me, ...WORLD.map(partyFromWorld)]
    .map((o) => edgeBetween(p, o))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 4);
  return { node: nodeFor(p, false), edges };
}

// ---------------------------------------------------------------------------
// People and connection cards

export async function getMe(): Promise<User & { cluster: string }> {
  await delay(150);
  const [profile, songs] = await Promise.all([db.getProfile(ME_ID), db.listSongs(ME_ID)]);
  if (!profile) throw new ApiError("We couldn't load your profile.");
  const motivations = myMotivations(); // NOT IN CONTRACT
  return { id: profile.id, name: profile.display_name, songs: songs.map(songFromRow), motivations, cluster: primaryCluster(motivations) };
}

export async function getUser(id: string): Promise<User & { cluster: string; edge: GalaxyEdge }> {
  await delay(350);
  const [profile, songs] = await Promise.all([db.getProfile(id), db.listSongs(id)]);
  const u = lookupUser(id); // NOT IN CONTRACT: motivations, cluster, edge
  if (!profile || !u) throw new ApiError("That person isn't in the galaxy anymore.");
  return {
    id: profile.id,
    name: profile.display_name,
    songs: songs.map(songFromRow),
    motivations: u.motivations.filter((m) => m.isPublic),
    cluster: u.primary,
    edge: edgeBetween(meParty(), partyFromWorld(u)),
  };
}

export async function getConnections(): Promise<Connection[]> {
  await delay(450);
  const rows = await db.matchProfiles(ME_ID, 14);
  const me = meParty();
  return rows.flatMap((r) => {
    const u = lookupUser(r.profile_id); // NOT IN CONTRACT: cluster, sharedMotivation, overlap counts
    if (!u) return [];
    const e = edgeBetween(me, partyFromWorld(u));
    return [
      {
        user: { id: r.profile_id, name: r.display_name },
        cluster: u.primary,
        similarity: r.similarity,
        sharedMotivation: e.sharedMotivation,
        sharedSongs: e.sharedSongs,
        sharedArtists: e.sharedArtists,
      },
    ];
  });
}

export async function getConnectionCard(otherId: string): Promise<ConnectionCard> {
  await delay(900);
  maybeFail("card");
  const row = await db.getConnectionCard(ME_ID, otherId);
  const u = lookupUser(otherId);
  if (!row || !u) throw new ApiError("That person isn't in the galaxy anymore.");
  return cardFromRow(row, ME_ID, buildConnectionCard(meParty(), partyFromWorld(u)));
}

// ---------------------------------------------------------------------------
// Messages. Text messages are contract rows; song swaps are NOT IN CONTRACT (lib/types.ts #9).

function mockSwaps(otherId?: string): [string, Message][] {
  return [...conversations.entries()]
    .filter(([other]) => !otherId || other === otherId)
    .flatMap(([other, msgs]) => msgs.filter((m) => m.kind === "swap").map((m): [string, Message] => [other, m]));
}

export async function getConversations(): Promise<ConversationSummary[]> {
  await delay(300);
  const rows = await db.listMessages(ME_ID);
  const threads = new Map<string, Message[]>();
  const add = (other: string, m: Message) => threads.set(other, [...(threads.get(other) ?? []), m]);
  for (const r of rows) add(r.user_a === ME_ID ? r.user_b : r.user_a, messageFromRow(r));
  for (const [other, m] of mockSwaps()) add(other, m);

  const summaries = await Promise.all(
    [...threads.entries()].map(async ([userId, msgs]) => {
      const profile = await db.getProfile(userId);
      const u = lookupUser(userId); // NOT IN CONTRACT: cluster
      if (!profile || !u) return [];
      return [{ userId, name: profile.display_name, cluster: u.primary, lastMessage: byTime(msgs).at(-1) }];
    }),
  );
  return summaries.flat().sort((a, b) => (b.lastMessage?.sentAt ?? "").localeCompare(a.lastMessage?.sentAt ?? ""));
}

export async function getConversation(userId: string): Promise<Conversation> {
  await delay(200);
  const [profile, card, rows] = await Promise.all([db.getProfile(userId), db.getConnectionCard(ME_ID, userId), db.listMessages(ME_ID, userId)]);
  const u = lookupUser(userId); // NOT IN CONTRACT: cluster
  if (!profile || !u) throw new ApiError("That person isn't in the galaxy anymore.");
  return {
    user: { id: profile.id, name: profile.display_name },
    cluster: u.primary,
    sharedMotivation: card?.card_json.shared_why,
    messages: byTime([...rows.map(messageFromRow), ...mockSwaps(userId).map(([, m]) => m)]),
    suggestedOpeners: card?.card_json.openers ?? [],
  };
}

export async function sendMessage(userId: string, text: string): Promise<Message> {
  await delay(150);
  const [user_a, user_b] = pair(ME_ID, userId);
  return messageFromRow(await db.insertMessage({ user_a, user_b, sender_id: ME_ID, body: text }));
}

/** NOT IN CONTRACT: no song-swap table. */
export async function sendSongSwap(userId: string, song: Song, reason: string, replyToSwapId?: string): Promise<Message> {
  await delay(300);
  const list = (conversations.get(userId) ?? []).map((m) =>
    m.kind === "swap" && m.swap.id === replyToSwapId ? { ...m, swap: { ...m.swap, status: "returned" as const } } : m,
  );
  const msg: Message = {
    id: `m-${Date.now()}`,
    fromUserId: ME_ID,
    sentAt: new Date().toISOString(),
    kind: "swap",
    swap: { id: `sw-${Date.now()}`, fromUserId: ME_ID, toUserId: userId, song, reason, status: "pending" },
  };
  conversations.set(userId, [...list, msg]);
  scheduleReply(userId);
  return msg;
}

/** Mock-only: resets seeded conversations and the realtime arrival (logo long-press). */
export function resetWorld() {
  resetMockWorld();
}

export function clusterColor(cluster: string) {
  return getCluster(cluster).color;
}
