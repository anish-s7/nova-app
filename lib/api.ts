"use client";

/**
 * Mock route handlers. Each function mirrors a future endpoint:
 *   importSpotify      -> POST /api/spotify/import
 *   searchSongs        -> GET  /api/songs?q=
 *   analyzeMusic       -> POST /api/analysis
 *   updateMotivation   -> PATCH /api/me/motivations/:id
 *   getGalaxy          -> GET  /api/galaxy
 *   getUser            -> GET  /api/users/:id
 *   getConnections     -> GET  /api/connections
 *   getConnectionCard  -> GET  /api/connections/:id/card
 *   getConversations   -> GET  /api/conversations
 *   getConversation    -> GET  /api/conversations/:id
 *   sendMessage        -> POST /api/conversations/:id/messages
 *   sendSongSwap       -> POST /api/conversations/:id/swaps
 * Swap the bodies for fetch() calls; the signatures stay the same.
 */

import { getCluster, type ClusterId } from "./clusters";
import { infer, primaryCluster, vectorFromMotivations, dominantMode } from "./inference";
import { SONG_CATALOG, songById } from "./music-context";
import {
  DEMO_MATCH_IDS,
  ME_ID,
  WORLD,
  buildArrival,
  buildConnectionCard,
  buildEdges,
  conversations,
  edgeBetween,
  overlap,
  partyFromWorld,
  resetConversations,
  scheduleReply,
  synthesizeSignals,
  worldUser,
  type Party,
  type WorldUser,
} from "./mock-world";
import { effectiveSongs, getSession, setSession, type FailureKey } from "./session";
import type {
  AnalysisResult,
  Connection,
  ConnectionCard,
  Conversation,
  ConversationSummary,
  GalaxyEdge,
  GalaxyNode,
  GalaxyResponse,
  InferredMotivation,
  ListeningSignal,
  Message,
  Song,
  SpotifyImport,
  User,
} from "./types";

export { ME_ID };

export class ApiError extends Error {
  constructor(
    message: string,
    public code: "unavailable" | "failed" = "failed",
  ) {
    super(message);
  }
}

function delay(ms: number) {
  const s = getSession();
  const scaled = s.demo ? ms * 0.6 : ms;
  return new Promise((r) => setTimeout(r, scaled + Math.random() * 200));
}

function maybeFail(key: FailureKey) {
  if (getSession().failures.includes(key)) {
    throw new ApiError(key === "spotify" ? "Spotify isn't responding right now." : "Something went wrong on our end.", key === "spotify" ? "unavailable" : "failed");
  }
}

// ---------------------------------------------------------------------------

const DEMO_BIAS = { quiet_company: 3 };

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

function myMotivations(): InferredMotivation[] {
  const s = getSession();
  if (s.motivations.length) return s.motivations;
  const songs = effectiveSongs(s);
  const signals = s.signals.length ? s.signals : synthesizeSignals(ME_ID, songs, "quiet_company");
  return infer({ userId: ME_ID, subject: { isMe: true }, songs, signals, bias: s.demo ? DEMO_BIAS : undefined }).motivations;
}

function meParty(): Party {
  const songs = effectiveSongs(getSession());
  const motivations = myMotivations();
  return { id: ME_ID, name: "You", songs, motivations, vector: vectorFromMotivations(motivations), mode: dominantMode(songs) };
}

export function myPrimaryCluster(): ClusterId {
  return primaryCluster(myMotivations());
}

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

/** Simulated realtime: a new user joins shortly after the galaxy opens. */
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

let arrivalUser: WorldUser | undefined;
function lookupUser(id: string): WorldUser | undefined {
  if (id === "priya") return (arrivalUser ??= buildArrival(myPrimaryCluster()));
  return worldUser(id);
}

export async function getMe(): Promise<User & { cluster: string }> {
  await delay(150);
  const me = meParty();
  return { id: ME_ID, name: "You", songs: me.songs, motivations: me.motivations, cluster: primaryCluster(me.motivations) };
}

export async function getUser(id: string): Promise<User & { cluster: string; edge: GalaxyEdge }> {
  await delay(350);
  const u = lookupUser(id);
  if (!u) throw new ApiError("That person isn't in the galaxy anymore.");
  return {
    id: u.id,
    name: u.name,
    songs: u.songs,
    motivations: u.motivations.filter((m) => m.isPublic),
    cluster: u.primary,
    edge: edgeBetween(meParty(), partyFromWorld(u)),
  };
}

export async function getConnections(): Promise<Connection[]> {
  await delay(450);
  const me = meParty();
  return WORLD.map((u) => ({ u, e: edgeBetween(me, partyFromWorld(u)) }))
    .sort((a, b) => b.e.similarity - a.e.similarity)
    .slice(0, 14)
    .map(({ u, e }) => ({
      user: { id: u.id, name: u.name },
      cluster: u.primary,
      similarity: e.similarity,
      sharedMotivation: e.sharedMotivation,
      sharedSongs: e.sharedSongs,
      sharedArtists: e.sharedArtists,
    }));
}

export async function getConnectionCard(otherId: string): Promise<ConnectionCard> {
  await delay(900);
  maybeFail("card");
  const u = lookupUser(otherId);
  if (!u) throw new ApiError("That person isn't in the galaxy anymore.");
  return buildConnectionCard(meParty(), partyFromWorld(u));
}

// ---------------------------------------------------------------------------

function visible(messages: Message[]) {
  const now = Date.now();
  return messages.filter((m) => new Date(m.sentAt).getTime() <= now);
}

export async function getConversations(): Promise<ConversationSummary[]> {
  await delay(300);
  return [...conversations.entries()]
    .map(([userId, msgs]) => {
      const u = lookupUser(userId)!;
      const shown = visible(msgs);
      return { userId, name: u.name, cluster: u.primary, lastMessage: shown[shown.length - 1] };
    })
    .sort((a, b) => (b.lastMessage?.sentAt ?? "").localeCompare(a.lastMessage?.sentAt ?? ""));
}

export async function getConversation(userId: string): Promise<Conversation> {
  await delay(200);
  const u = lookupUser(userId);
  if (!u) throw new ApiError("That person isn't in the galaxy anymore.");
  const card = buildConnectionCard(meParty(), partyFromWorld(u));
  return {
    user: { id: u.id, name: u.name },
    cluster: u.primary,
    sharedMotivation: card.sharedMotivations[0]?.motivation,
    messages: visible(conversations.get(userId) ?? []),
    suggestedOpeners: card.suggestedOpeners,
  };
}

export async function sendMessage(userId: string, text: string): Promise<Message> {
  await delay(150);
  const msg: Message = { id: `m-${Date.now()}`, fromUserId: ME_ID, sentAt: new Date().toISOString(), kind: "text", text };
  conversations.set(userId, [...(conversations.get(userId) ?? []), msg]);
  scheduleReply(userId);
  return msg;
}

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

export function resetWorld() {
  resetConversations();
  arrivalUser = undefined;
}

export function clusterColor(cluster: string) {
  return getCluster(cluster).color;
}
