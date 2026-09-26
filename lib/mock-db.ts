import { effectiveSongs, getSession } from "./session";
import { ME_ID, WORLD, buildConnectionCard, conversations, edgeBetween, lookupUser, partyFor, partyFromWorld, scheduleReply } from "./mock-world";
import type { ConnectionCardRow, Db, Message, MessageRow, Song, SongRow } from "./types";

/**
 * The mock world, served in db/contract.md row shapes. Only lib/api.ts imports this;
 * after the backend merge, api.ts swaps it for the real implementation.
 */

const CREATED_AT = "2026-09-01T00:00:00.000Z";

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function songRow(profileId: string, s: Song): SongRow {
  return {
    // Catalog slug stands in for the uuid; see lib/types.ts mismatch #1.
    id: s.id,
    profile_id: profileId,
    title: s.title,
    artist: s.artist,
    spotify_track_id: s.source === "spotify" ? (s.spotifyId ?? null) : null,
    // The frontend doesn't collect a per-song reason yet (mismatch #3).
    reason_text: "",
    is_public: true,
    created_at: CREATED_AT,
  };
}

function messageRow(otherId: string, m: Extract<Message, { kind: "text" }>): MessageRow {
  const [user_a, user_b] = pair(ME_ID, otherId);
  return { id: m.id, user_a, user_b, sender_id: m.fromUserId, body: m.text, created_at: m.sentAt };
}

export const mockDb: Db = {
  async getProfile(id) {
    if (id === ME_ID) return { id, display_name: "You", created_at: CREATED_AT };
    const u = lookupUser(id);
    return u ? { id: u.id, display_name: u.name, created_at: CREATED_AT } : null;
  },

  async listSongs(profileId) {
    const songs = profileId === ME_ID ? effectiveSongs(getSession()) : (lookupUser(profileId)?.songs ?? []);
    return songs.map((s) => songRow(profileId, s));
  },

  async insertSongs(rows) {
    // The mock "me" reads songs from the session (written by api.saveSongs), so just echo rows.
    return rows.map((r, i) => ({ ...r, id: `song-${Date.now()}-${i}`, created_at: new Date().toISOString() }));
  },

  async matchProfiles(targetProfileId, matchCount = 10) {
    const target = partyFor(targetProfileId);
    if (!target) return [];
    return WORLD.filter((u) => u.id !== targetProfileId)
      .map((u) => ({ u, similarity: edgeBetween(target, partyFromWorld(u)).similarity }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, matchCount)
      .map(({ u, similarity }) => ({ profile_id: u.id, display_name: u.name, similarity }));
  },

  async getConnectionCard(profileId, otherProfileId): Promise<ConnectionCardRow | null> {
    const a = partyFor(profileId);
    const b = partyFor(otherProfileId);
    if (!a || !b) return null;
    // The mock generator writes from profileId's side; store evidence under the ordered ids.
    const view = buildConnectionCard(a, b);
    const [first] = view.sharedMotivations;
    const [user_a, user_b] = pair(profileId, otherProfileId);
    const mine = first.evidenceA.text;
    const theirs = first.evidenceB.text;
    return {
      id: `card-${user_a}-${user_b}`,
      user_a,
      user_b,
      card_json: {
        shared_why: first.motivation,
        evidence: user_a === profileId ? { user_a: mine, user_b: theirs } : { user_a: theirs, user_b: mine },
        difference: view.meaningfulDifference.summary,
        openers: view.suggestedOpeners,
        suggested_swap_prompt: `Swap a song that feels like "${first.motivation.toLowerCase()}" to you.`,
      },
      created_at: CREATED_AT,
    };
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

  async insertMessage({ user_a, user_b, sender_id, body }) {
    const other = sender_id === user_a ? user_b : user_a;
    const row: MessageRow = { id: `m-${Date.now()}`, user_a, user_b, sender_id, body, created_at: new Date().toISOString() };
    conversations.set(other, [...(conversations.get(other) ?? []), { id: row.id, fromUserId: sender_id, sentAt: row.created_at, kind: "text", text: body }]);
    scheduleReply(other);
    return row;
  },
};
