import { effectiveSongs, getSession, setSession } from "./session";
import type { Tag } from "./tags";
import { ME_ID, WORLD, buildConnectionCard, buildContrastJson, wanderCandidates, conversations, edgeBetween, lookupUser, partyFor, partyFromWorld, scheduleReply } from "./mock-world";
import type { ConnectionCardRow, ConfirmedMatchRow, Db, Message, MessageRow, Song, SongPickRow, SongRow, WanderRow } from "./types";

/** Contrast cards Wander has already written, by other profile id. Like the real table, a cached card is never regenerated. */
const contrastCache = new Map<string, ConnectionCardRow>();

/**
 * The mock world, served in db/contract.md row shapes. Only lib/api.ts imports this;
 * after the backend merge, api.ts swaps it for the real implementation.
 */

const CREATED_AT = "2026-09-01T00:00:00.000Z";

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function songRow(s: Song): SongRow {
  return {
    // Catalog slug stands in for the uuid; see lib/types.ts mismatch #1.
    id: s.id,
    title: s.title,
    artist: s.artist,
    mbid: null,
    fallback_key: `${s.title.toLowerCase()}::${s.artist.toLowerCase()}`,
    resolution_source: "gemini_fallback",
    spotify_track_id: s.source === "spotify" ? (s.spotifyId ?? null) : null,
    album_art_url: s.albumArtUrl ?? null,
    context_summary: null,
    embedding: null,
    created_at: CREATED_AT,
  };
}

function pickRow(profileId: string, s: Song): SongPickRow & { song: SongRow } {
  return {
    id: `${profileId}:${s.id}`,
    profile_id: profileId,
    song_id: s.id,
    // The mock world has no per-pick tags or slider position.
    tags: [],
    valence: 0,
    energy: 0,
    reason_text: null,
    is_public: true,
    created_at: CREATED_AT,
    song: songRow(s),
  };
}

/** Mock match card for (me, other), evidence stored under the ordered ids like the real table. */
function mockMatchCard(otherProfileId: string): ConnectionCardRow | null {
  const a = partyFor(ME_ID);
  const b = partyFor(otherProfileId);
  if (!a || !b) return null;
  const view = buildConnectionCard(a, b);
  const [first] = view.sharedMotivations;
  const [user_a, user_b] = pair(ME_ID, otherProfileId);
  const mine = first.evidenceA.text;
  const theirs = first.evidenceB.text;
  return {
    id: `card-${user_a}-${user_b}`,
    user_a,
    user_b,
    card_json: {
      shared_why: first.motivation,
      evidence: user_a === ME_ID ? { user_a: mine, user_b: theirs } : { user_a: theirs, user_b: mine },
      difference: view.meaningfulDifference.summary,
      openers: view.suggestedOpeners,
      suggested_swap_prompt: `Swap a song that feels like "${first.motivation.toLowerCase()}" to you.`,
    },
    created_at: CREATED_AT,
  };
}

function messageRow(otherId: string, m: Extract<Message, { kind: "text" }>): MessageRow {
  const [user_a, user_b] = pair(ME_ID, otherId);
  return { id: m.id, user_a, user_b, sender_id: m.fromUserId, body: m.text, created_at: m.sentAt };
}

export function resetMockDb() {
  contrastCache.clear();
}

export const mockDb: Db = {
  async getProfile(id) {
    if (id === ME_ID) return { id, display_name: "You", created_at: CREATED_AT };
    const u = lookupUser(id);
    return u ? { id: u.id, display_name: u.name, created_at: CREATED_AT } : null;
  },

  async listPicks(id) {
    if (id !== ME_ID) return (lookupUser(id)?.songs ?? []).map((s) => pickRow(id, s));
    // "Me" lives in the session: songs plus how each one feels.
    const s = getSession();
    return effectiveSongs(s).map((song) => {
      const f = s.feelings?.[song.id];
      return { ...pickRow(id, song), ...(f ? { tags: f.tags, valence: f.valence, energy: f.energy } : {}) };
    });
  },

  async updatePick(id, patch) {
    const songId = id.slice(`${ME_ID}:`.length);
    setSession((s) => ({ feelings: { ...s.feelings, [songId]: { tags: patch.tags as Tag[], valence: patch.valence, energy: patch.energy, placed: true } } }), true);
    const song = effectiveSongs(getSession()).find((x) => x.id === songId);
    if (!song) throw new Error("Pick not found");
    return { ...pickRow(ME_ID, song), ...patch };
  },

  async deletePick(id) {
    const songId = id.slice(`${ME_ID}:`.length);
    setSession((s) => ({ songs: effectiveSongs(s).filter((x) => x.id !== songId) }), true);
  },

  async insertPick(pick) {
    // The mock "me" reads songs from the session (written by api.saveSongs), so just echo the pick.
    const now = new Date().toISOString();
    const song: SongRow = {
      ...songRow({ id: `song-${Date.now()}`, title: pick.title, artist: pick.artist, albumArtUrl: pick.albumArtUrl ?? undefined, spotifyId: pick.spotifyTrackId ?? undefined, source: pick.spotifyTrackId ? "spotify" : "manual" }),
      created_at: now,
    };
    return {
      song,
      pick: {
        id: `pick-${Date.now()}`,
        profile_id: ME_ID,
        song_id: song.id,
        tags: pick.tags,
        valence: pick.valence,
        energy: pick.energy,
        reason_text: pick.reasonText ?? null,
        is_public: pick.isPublic ?? true,
        created_at: now,
      },
    };
  },

  async getMatches(limit = 10): Promise<ConfirmedMatchRow[]> {
    const target = partyFor(ME_ID);
    if (!target) return [];
    return WORLD.filter((u) => u.id !== ME_ID)
      .map((u) => ({ u, similarity: edgeBetween(target, partyFromWorld(u)).similarity }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .flatMap(({ u }) => {
        const row = mockMatchCard(u.id);
        return row ? [{ profileId: u.id, displayName: u.name, card: row.card_json }] : [];
      });
  },

  async getConnectionCard(otherProfileId): Promise<ConnectionCardRow | null> {
    // The mock "cache" always hits, so the demo never waits on generation.
    return contrastCache.get(otherProfileId) ?? mockMatchCard(otherProfileId);
  },

  async generateConnectionCard(otherProfileId) {
    const row = mockMatchCard(otherProfileId);
    return row ? { status: "match", card: row.card_json } : { status: "insufficient_evidence" };
  },

  async wander(limit = 3): Promise<WanderRow[]> {
    const me = partyFor(ME_ID);
    if (!me) return [];
    return wanderCandidates(limit).map(({ user, song }) => {
      const [user_a, user_b] = pair(ME_ID, user.id);
      const json = buildContrastJson(me, partyFromWorld(user), song);
      const card_json = user_a === ME_ID ? json : { ...json, evidence: { user_a: json.evidence.user_b, user_b: json.evidence.user_a } };
      const row = contrastCache.get(user.id) ?? { id: `card-${user_a}-${user_b}`, user_a, user_b, card_json, created_at: CREATED_AT };
      contrastCache.set(user.id, row);
      return { profile_id: user.id, display_name: user.name, card: row };
    });
  },

  async listMessages(profileId, otherProfileId) {
    // Mock conversations are stored from ME_ID's side only.
    if (profileId !== ME_ID) return [];
    const now = Date.now();
    return [...conversations.entries()]
      .filter(([other]) => !otherProfileId || other === otherProfileId)
      .flatMap(([other, msgs]) =>
        msgs
          // Canned replies are future-dated so they "arrive" a moment after you send.
          .filter((m): m is Extract<Message, { kind: "text" }> => m.kind === "text" && new Date(m.sentAt).getTime() <= now)
          .map((m) => messageRow(other, m)),
      );
  },

  async insertMessage({ otherProfileId, text }) {
    const [user_a, user_b] = pair(ME_ID, otherProfileId);
    const row: MessageRow = { id: `m-${Date.now()}`, user_a, user_b, sender_id: ME_ID, body: text, created_at: new Date().toISOString() };
    conversations.set(otherProfileId, [...(conversations.get(otherProfileId) ?? []), { id: row.id, fromUserId: ME_ID, sentAt: row.created_at, kind: "text", text }]);
    scheduleReply(otherProfileId);
    return row;
  },
};
