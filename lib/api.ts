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

import { CLUSTER_IDS, getCluster } from "./clusters";
import type { SongTag } from "./tags";
import { LEGACY_SONG_TAGS } from "./cluster-assign";
import { ApiError } from "./api-error";
import { REAL_DATA } from "./data-source";
import { httpDb } from "./http-db";
import * as real from "./real-api";
import { infer, primaryCluster } from "./inference";
import { mockDb, resetMockDb } from "./mock-db";
import { expandOrder, sampleGalaxy } from "./galaxy-sample";
import { galaxyFromWindow, galaxyMoreFromWindow, type GalaxyMoreWindow, type GalaxyWindow } from "./galaxy-adapter";
import { buildSongLayer, type SongLayer } from "./song-layer";
import { classifyMix, mixFromScores } from "./why-mix";
import { buildClusterDetail, type ClusterDetail } from "./cluster-songs";
import { listeningMoment } from "./texture";
import { threadFrom } from "./thread";
import { SONG_CATALOG } from "./music-context";
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
  scheduleSwapBack,
  wanderCandidates,
  worldUser,
  type Party,
} from "./mock-world";
import { getSession, setSession, type Feeling, type FailureKey } from "./session";
import type {
  AnalysisResult,
  Connection,
  ConnectionCard,
  ConnectionCardRow,
  ContrastCard,
  Conversation,
  ConversationSummary,
  Db,
  GalaxyEdge,
  GalaxyMore,
  GalaxyNode,
  GalaxyQuery,
  GalaxyResponse,
  InferredMotivation,
  ListeningSignal,
  Message,
  MessageRow,
  Song,
  SongRow,
  User,
  WanderEntry,
} from "./types";

// ===========================================================================
// SWAP POINT: the only line that decides mock vs real data (see lib/data-source.ts).
// Real mode: `db` is the route handlers, and every exported view function below that has a
// real counterpart delegates to lib/real-api.ts first. The mock bodies stay for demo mode.
const db: Db = REAL_DATA ? httpDb : mockDb;
// ===========================================================================

export { ME_ID, ApiError, REAL_DATA };

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


// ---------------------------------------------------------------------------
// Row -> view mappers

const catalogArt = new Map(SONG_CATALOG.map((s) => [s.id, s.albumArtUrl]));

function songFromRow(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    albumArtUrl: catalogArt.get(row.id) ?? row.album_art_url ?? undefined, // mock catalog art first, then the real column
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

/** Resolves card_json.shared_song to a catalog Song. NOT IN CONTRACT: song identity across users (mismatch #1). */
function songFromShared(shared: { title: string; artist: string }): Song {
  return SONG_CATALOG.find((s) => s.title === shared.title && s.artist === shared.artist) ?? { id: `${shared.title}-${shared.artist}`, title: shared.title, artist: shared.artist, source: "manual" };
}

function contrastFromRow(row: ConnectionCardRow, meId: string): ContrastCard {
  const cj = row.card_json;
  if (cj.kind !== "contrast" || !cj.shared_song) throw new ApiError("That card isn't a contrast card.");
  const iAmA = row.user_a === meId;
  return {
    userA: meId,
    userB: iAmA ? row.user_b : row.user_a,
    song: songFromShared(cj.shared_song),
    sharedThread: cj.shared_why,
    feelA: iAmA ? cj.evidence.user_a : cj.evidence.user_b,
    feelB: iAmA ? cj.evidence.user_b : cj.evidence.user_a,
    difference: cj.difference,
    suggestedOpeners: cj.openers,
    swapPrompt: cj.suggested_swap_prompt,
  };
}

function byTime(messages: Message[]) {
  return [...messages].sort((a, b) => a.sentAt.localeCompare(b.sentAt));
}

// ---------------------------------------------------------------------------
// Onboarding. NOT IN CONTRACT: Spotify import, catalog search and analysis aren't DB reads.
// In real mode, search hits the real catalog (GET /api/songs/search); the mock keeps the 24-song
// demo catalog. There's no Spotify import in the UI: Spotify's development mode only admits a
// handful of allowlisted accounts, so everyone picks their own songs.

/**
 * The tags to choose from for a song on the feel step, "+" and the edit sheet. Real mode: written
 * for that song (song_tags); demo mode: the original fixed tags.
 */
export async function getSongTags(song: { title: string; artist: string }): Promise<SongTag[]> {
  return REAL_DATA ? real.getSongTags(song) : LEGACY_SONG_TAGS;
}

export async function searchSongs(q: string): Promise<Song[]> {
  if (REAL_DATA) return real.searchSongs(q);
  await delay(180);
  const needle = q.trim().toLowerCase();
  if (!needle) return SONG_CATALOG.slice(0, 12);
  return SONG_CATALOG.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(needle)).slice(0, 20);
}

export async function analyzeMusic(input: { songs: Song[]; signals: ListeningSignal[] }): Promise<AnalysisResult> {
  if (REAL_DATA) return analyzeSavedPicks();
  await delay(1400);
  maybeFail("analysis");
  const s = getSession();
  return infer({ userId: ME_ID, subject: { isMe: true }, songs: input.songs, signals: input.signals, bias: s.demo ? DEMO_BIAS : undefined });
}

/** Real mode only: my stored listening portrait (no Gemini call), or null before the first one. */
export async function getStoredAnalysis(): Promise<AnalysisResult | null> {
  return REAL_DATA ? real.getStoredAnalysis() : null;
}

/**
 * Real mode: the portrait is read from saved picks, so wait for the feel step's save to finish
 * (retrying it if it failed — saveSongs skips songs already saved), then ask Gemini for it.
 * Also warms the match cache in the background so Connections is ready after the reveal.
 */
async function analyzeSavedPicks(): Promise<AnalysisResult> {
  const status = getSession().saveStatus;
  if (status === "error" || status === "idle") await saveSongs();
  while (getSession().saveStatus === "saving") await delay(400);
  if (getSession().saveStatus === "error") throw new ApiError(getSession().saveError ?? "We couldn't save your songs.");
  const analysis = await real.generateAnalysis();
  void db.getMatches(14).catch((err) => console.error("Warming matches after onboarding failed:", err));
  return analysis;
}

/**
 * Onboarding step 1: the songs someone brought. Session only — nothing reaches the backend until
 * they've described how each one feels (`/onboarding/feel`, then `saveSongs`). Manual picks are
 * all described; a Spotify import's `describe` list is chosen on the feel screen.
 */
export function chooseSongs(input: { source: "spotify" | "manual"; songs: Song[]; signals: ListeningSignal[] }) {
  setSession(
    {
      source: input.source,
      songs: input.songs,
      signals: input.signals,
      analysis: undefined,
      motivations: [],
      describe: input.source === "manual" ? input.songs.map((s) => s.id) : undefined,
      feelings: {},
      saveStatus: "idle",
      saveError: undefined,
      savedSongIds: [],
    },
    true,
  );
}

/**
 * Onboarding step 2: saves each described song with its tags + mood circle position. Runs in
 * the background while the reading screen plays; progress lives in `session.saveStatus`.
 * Sequential on purpose: POST /api/picks calls MusicBrainz, which is rate-limited to 1 req/s.
 * Safe to call again after an error — songs already saved are skipped, so no pick is duplicated.
 */
export async function saveSongs() {
  const s = getSession();
  const songs = s.songs.filter((song) => (s.describe ?? []).includes(song.id));
  setSession({ saveStatus: "saving", saveError: undefined });
  try {
    for (const song of songs) {
      if (getSession().savedSongIds?.includes(song.id)) continue;
      const feeling = s.feelings?.[song.id];
      if (!feeling || feeling.tags.length === 0) throw new ApiError(`"${song.title}" still needs at least one tag.`);
      await db.insertPick({
        title: song.title,
        artist: song.artist,
        spotifyTrackId: song.source === "spotify" ? (song.spotifyId ?? null) : null,
        albumArtUrl: song.albumArtUrl ?? null,
        tags: feeling.tags,
        valence: feeling.valence,
        energy: feeling.energy,
      });
      setSession((cur) => ({ savedSongIds: [...(cur.savedSongIds ?? []), song.id] }));
    }
    setSession({ saveStatus: "saved" });
  } catch (e) {
    setSession({ saveStatus: "error", saveError: e instanceof Error ? e.message : "We couldn't save your songs." });
  }
}

/**
 * Adds one song from the galaxy's "+" sheet (real mode only). Same tag picker + mood circle as the
 * onboarding feel step, so a song added here carries the same real signal into matching/clusters —
 * no more placeholder tags/valence/energy. Slow: MusicBrainz, cover art and, for a new song, Gemini
 * all run inside the request.
 */
export async function addSong(input: { title: string; artist: string; tags: string[]; valence: number; energy: number; reason?: string }) {
  await db.insertPick({
    title: input.title,
    artist: input.artist,
    tags: input.tags,
    valence: input.valence,
    energy: input.energy,
    reasonText: input.reason || undefined,
  });
  // A new song changes the portrait. Refresh it in the background; the add itself already succeeded.
  refreshPortraitInBackground("adding a song");
}

/** Real mode: regenerate my portrait after my songs changed, without making the caller wait. */
function refreshPortraitInBackground(after: string) {
  if (!REAL_DATA) return;
  void real
    .generateAnalysis()
    .then((analysis) => setSession({ analysis, motivations: analysis.motivations }))
    .catch((err) => console.error(`Refreshing the portrait after ${after} failed:`, err));
}

/** One of my saved songs, with how it feels to me. `pickId` is what edit/remove take. */
export type MySong = { pickId: string; song: Song; feeling: Feeling };

/** My songs as saved (real mode: my picks; mock: the session), with their current feelings. */
export async function getMySongs(): Promise<MySong[]> {
  let rows = await db.listPicks(ME_ID);
  if (!REAL_DATA) {
    // The mock "me" falls back to a persona playlist and holds the current onboarding run's songs;
    // only songs that run actually saved count as yours.
    const saved = new Set(getSession().savedSongIds ?? []);
    rows = rows.filter((r) => saved.has(r.song_id));
  }
  return rows.map((r) => ({
    pickId: r.id,
    song: songFromRow(r.song),
    feeling: { tags: r.tags, valence: r.valence, energy: r.energy, placed: r.tags.length > 0 || r.valence !== 0 || r.energy !== 0 },
  }));
}

/** Same song, however it was found (search result, Spotify import, saved pick). */
export function sameSong(a: Pick<Song, "title" | "artist">, b: Pick<Song, "title" | "artist">) {
  const norm = (s: string) => s.trim().toLowerCase();
  return norm(a.title) === norm(b.title) && norm(a.artist) === norm(b.artist);
}

/** Changes how one of my songs feels. The pick is updated in place, never duplicated. */
export async function updateSongFeeling(pickId: string, feeling: Pick<Feeling, "tags" | "valence" | "energy">) {
  await db.updatePick(pickId, { tags: feeling.tags, valence: feeling.valence, energy: feeling.energy });
  refreshPortraitInBackground("editing a song");
}

/** Removes one of my songs. */
export async function removeSong(pickId: string) {
  await db.deletePick(pickId);
  refreshPortraitInBackground("removing a song");
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
  const mix = mixFromScores(u.vector);
  const active = u.motivations.filter((m) => m.feedback !== "rejected" && (isMe || m.isPublic));
  return {
    userId: u.id,
    name: u.name,
    cluster: primaryCluster(u.motivations),
    whys: mix,
    blended: classifyMix(mix, u.id).blended,
    topMotivations: active.slice(0, 3).map((m) => m.label),
    isMe,
  };
}

/** Stable per-person "days since joined" for the mock, which has no join dates. */
function mockJoinedDaysAgo(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 60;
}

/** The mock population as sampler candidates, plus what's needed to sample it. */
function mockWindow(limit?: number) {
  const me = meParty();
  const everyone = WORLD.map(partyFromWorld);
  // Far-star candidates: people who share one of my songs but come at it from somewhere else (Wander's pool).
  const bridges = new Set(wanderCandidates(everyone.length).map((c) => c.user.id));
  const candidates = everyone.map((p) => ({
    id: p.id,
    cluster: primaryCluster(p.motivations),
    vector: CLUSTER_IDS.map((c) => p.vector[c]),
    similarity: edgeBetween(me, p).similarity,
    joinedDaysAgo: mockJoinedDaysAgo(p.id),
    bridge: bridges.has(p.id) ? 1 : 0,
  }));
  const day = Math.floor(Date.now() / 86_400_000);
  const sample = sampleGalaxy(candidates, { budget: limit, seed: `${ME_ID}:${day}` });
  return { me, everyone, candidates, sample };
}

/**
 * Galaxy swap point. Set NEXT_PUBLIC_GALAXY_SOURCE=http to read the real bounded window
 * (GET /api/galaxy) instead of the mock world. Needs a Supabase session and the
 * 20260927010000_galaxy_window migration. Default stays mock so the demo keeps working.
 */
const GALAXY_HTTP = REAL_DATA || process.env.NEXT_PUBLIC_GALAXY_SOURCE === "http";

async function galaxyFetch<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin" });
  if (!res.ok) throw new ApiError(res.status === 401 ? "Sign in to see your galaxy." : "The galaxy didn't load.");
  return res.json() as Promise<T>;
}

/** Mock hop: the star's nearest neighbors by the mock similarity, with you as the anchor. */
function mockHop(centerId: string): GalaxyResponse {
  const me = meParty();
  const centerUser = worldUser(centerId);
  if (!centerUser) throw new ApiError("That star isn't in your galaxy");
  const center = partyFromWorld(centerUser);
  const near = WORLD.filter((u) => u.id !== centerId)
    .map(partyFromWorld)
    .map((p) => ({ p, edge: edgeBetween(center, p) }))
    .sort((a, b) => b.edge.similarity - a.edge.similarity)
    .slice(0, 14);
  const yours = (p: Party) => edgeBetween(me, p).similarity;
  return {
    nodes: [
      { ...nodeFor(me, true), youSimilarity: 1 },
      { ...nodeFor(center, false), youSimilarity: yours(center) },
      ...near.map(({ p }) => ({ ...nodeFor(p, false), youSimilarity: yours(p) })),
    ],
    edges: near.map(({ edge }) => edge),
    centerId,
    status: "ready",
  };
}

export async function getGalaxy(query: GalaxyQuery = {}): Promise<GalaxyResponse> {
  if (GALAXY_HTTP) {
    const qs = new URLSearchParams({ ...(query.limit ? { limit: String(query.limit) } : {}), ...(query.center ? { center: query.center } : {}) }).toString();
    const galaxy = galaxyFromWindow(await galaxyFetch<GalaxyWindow>(`/api/galaxy${qs ? `?${qs}` : ""}`), ME_ID);
    // Edges in a hopped window are the star's, not yours, so they say nothing about your similarity.
    if (!query.center) real.rememberSimilarities(galaxy.edges);
    return galaxy;
  }
  await delay(700);
  maybeFail("galaxy");
  if (query.center) return mockHop(query.center);
  // Bounded window: only the sampled people are drawn or edged. At today's size this keeps everyone.
  const { me, everyone, sample } = mockWindow(query.limit);
  const keep = new Set(sample.ids);
  const others = everyone.filter((p) => keep.has(p.id));
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
    nodes: [nodeFor(me, true), ...others.map((o) => ({ ...nodeFor(o, false), ...(sample.slice.get(o.id) === "far" ? { far: true } : {}) }))],
    edges,
    topMatchId,
    status: "ready",
    sampled: sample.sampled,
    hidden: sample.hidden,
  };
}

/** "More here": the next people in one cluster, ready to fade in as arrivals. `have` is how many extra this cluster already shows. */
export async function getGalaxyMore(cluster: string, have: number, step = 40, limit?: number, center?: string): Promise<GalaxyMore> {
  if (GALAXY_HTTP) {
    const qs = new URLSearchParams({ cluster, have: String(have), ...(limit ? { limit: String(limit) } : {}), ...(center ? { center } : {}) });
    // Arrivals are never "me", so no meId is needed.
    return galaxyMoreFromWindow(await galaxyFetch<GalaxyMoreWindow>(`/api/galaxy/more?${qs}`), "");
  }
  await delay(350);
  maybeFail("galaxy");
  if (center) return { arrivals: [], remaining: 0 }; // mock hops show the star's whole neighborhood already
  const { me, everyone, candidates, sample } = mockWindow(limit);
  const order = expandOrder(candidates, new Set(sample.ids), cluster);
  const byId = new Map(everyone.map((p) => [p.id, p]));
  const drawn = [me, ...sample.ids.map((id) => byId.get(id)!)];
  const arrivals = order.slice(have, have + step).map((c) => {
    const p = byId.get(c.id)!;
    const edges = drawn
      .map((o) => edgeBetween(p, o))
      .sort((x, y) => y.similarity - x.similarity)
      .slice(0, 2);
    return { node: nodeFor(p, false), edges };
  });
  return { arrivals, remaining: Math.max(0, order.length - have - arrivals.length) };
}

/** NOT IN CONTRACT: clusters aren't stored yet (lib/types.ts #5). Songs + listeners inside one "why". */
export async function getClusterDetail(id: string): Promise<ClusterDetail> {
  if (REAL_DATA) return real.getClusterDetail(id);
  await delay(250);
  return buildClusterDetail(getCluster(id).id);
}

/** NOT IN CONTRACT: song stars and themes come from per-pick clustering, which doesn't exist yet. */
export async function getSongLayer(): Promise<SongLayer> {
  if (REAL_DATA) return real.getSongLayer();
  await delay(150);
  return buildSongLayer(getSession().picks ?? []);
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
  if (REAL_DATA) return real.getMe();
  await delay(150);
  const [profile, picks] = await Promise.all([db.getProfile(ME_ID), db.listPicks(ME_ID)]);
  if (!profile) throw new ApiError("We couldn't load your profile.");
  const motivations = myMotivations(); // NOT IN CONTRACT
  return { id: profile.id, name: profile.display_name, songs: picks.map((p) => songFromRow(p.song)), motivations, cluster: primaryCluster(motivations) };
}

export async function getUser(id: string): Promise<User & { cluster: string; edge: GalaxyEdge }> {
  if (REAL_DATA) return real.getUser(id);
  await delay(350);
  const [profile, picks] = await Promise.all([db.getProfile(id), db.listPicks(id)]);
  const u = lookupUser(id); // NOT IN CONTRACT: motivations, cluster, edge
  if (!profile || !u) throw new ApiError("That person isn't in the galaxy anymore.");
  return {
    id: profile.id,
    name: profile.display_name,
    songs: picks.map((p) => songFromRow(p.song)),
    motivations: u.motivations.filter((m) => m.isPublic),
    cluster: u.primary,
    listening: listeningMoment(u.id, u.songs, u.primary),
    edge: edgeBetween(meParty(), partyFromWorld(u)),
  };
}

export async function getConnections(): Promise<Connection[]> {
  if (REAL_DATA) return real.getConnections();
  await delay(450);
  // Every match here already passed the AI evidence-check and carries its card (ConfirmedMatchRow).
  const rows = await db.getMatches(14);
  const me = meParty();
  return rows.flatMap((r) => {
    const u = lookupUser(r.profileId); // NOT IN CONTRACT: cluster, similarity, sharedMotivation, overlap counts
    if (!u) return [];
    const e = edgeBetween(me, partyFromWorld(u));
    return [
      {
        user: { id: r.profileId, name: r.displayName },
        cluster: u.primary,
        similarity: e.similarity,
        sharedMotivation: e.sharedMotivation,
        sharedSongs: e.sharedSongs,
        sharedArtists: e.sharedArtists,
        evidenceSongs: evidenceSongs(me.songs, u.songs),
      },
    ];
  });
}

/** Their songs that overlap with mine: same song first, then same artist. */
function evidenceSongs(mine: Song[], theirs: Song[], max = 4): Song[] {
  const ids = new Set(mine.map((s) => s.id));
  const artists = new Set(mine.map((s) => s.artist));
  const same = theirs.filter((s) => ids.has(s.id));
  const sameArtist = theirs.filter((s) => !ids.has(s.id) && artists.has(s.artist));
  return [...same, ...sameArtist].slice(0, max);
}

export async function getConnectionCard(otherId: string): Promise<ConnectionCard> {
  if (REAL_DATA) return real.getConnectionCard(otherId);
  await delay(900);
  maybeFail("card");
  const row = await db.getConnectionCard(otherId);
  const u = lookupUser(otherId);
  if (!row || !u) throw new ApiError("That person isn't in the galaxy anymore.");
  return cardFromRow(row, ME_ID, buildConnectionCard(meParty(), partyFromWorld(u)));
}

/**
 * Wander: people who picked the same song but feel it differently. Only ever called from an
 * explicit tap, never on load. Real backend: POST /api/wander (Gemini judges each candidate).
 */
export async function getWander(): Promise<WanderEntry[]> {
  if (REAL_DATA) return real.getWander();
  await delay(1800); // stands in for the Gemini contrast check
  maybeFail("card");
  const rows = await db.wander();
  return rows.map((r) => ({
    user: { id: r.profile_id, name: r.display_name, cluster: lookupUser(r.profile_id)?.primary ?? "quiet_company" }, // cluster: NOT IN CONTRACT
    card: contrastFromRow(r.card, ME_ID),
  }));
}

export async function getContrastCard(otherId: string): Promise<ContrastCard> {
  if (REAL_DATA) return real.getContrastCard(otherId);
  await delay(300);
  const row = await db.getConnectionCard(otherId);
  if (!row) throw new ApiError("That person isn't in the galaxy anymore.");
  return contrastFromRow(row, ME_ID);
}

// ---------------------------------------------------------------------------
// Messages. Text messages are contract rows; song swaps are NOT IN CONTRACT (lib/types.ts #9).

function mockSwaps(otherId?: string): [string, Message][] {
  return [...conversations.entries()]
    .filter(([other]) => !otherId || other === otherId)
    .flatMap(([other, msgs]) => msgs.filter((m) => m.kind === "swap").map((m): [string, Message] => [other, m]));
}

export async function getConversations(): Promise<ConversationSummary[]> {
  if (REAL_DATA) return real.getConversations();
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
      const ordered = byTime(msgs);
      return [
        {
          userId,
          name: profile.display_name,
          cluster: u.primary,
          lastMessage: ordered.at(-1),
          threadSongs: msgs.filter((m) => m.kind === "swap").length,
          turn: threadFrom(ordered, ME_ID).turn,
        },
      ];
    }),
  );
  return summaries.flat().sort((a, b) => (b.lastMessage?.sentAt ?? "").localeCompare(a.lastMessage?.sentAt ?? ""));
}

export async function getConversation(userId: string): Promise<Conversation> {
  if (REAL_DATA) return real.getConversation(userId);
  await delay(200);
  const [profile, card, rows] = await Promise.all([db.getProfile(userId), db.getConnectionCard(userId), db.listMessages(ME_ID, userId)]);
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
  if (REAL_DATA) return real.sendMessage(userId, text);
  await delay(150);
  return messageFromRow(await db.insertMessage({ otherProfileId: userId, text }));
}

/** NOT IN CONTRACT: no song-swap table. */
export async function sendSongSwap(userId: string, song: Song, reason: string, replyToSwapId?: string): Promise<Message> {
  if (REAL_DATA) return real.sendSongSwap(userId, song, reason);
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
  if (!replyToSwapId) scheduleSwapBack(userId);
  return msg;
}

/** Resets the mock world (seeded conversations, realtime arrival; logo long-press) and forgets who "me" is in real mode, so a new sign-in starts clean. */
export function resetWorld() {
  resetMockWorld();
  resetMockDb();
  real.resetRealWorld();
}

export function clusterColor(cluster: string) {
  return getCluster(cluster).color;
}
