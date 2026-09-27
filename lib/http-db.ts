"use client";

import { ApiError } from "./api-error";
import type { Portrait } from "./portrait";
import type {
  ConfirmedMatchRow,
  ConnectionCardJson,
  ConnectionCardRow,
  Db,
  MessageRow,
  ProfileRow,
  SongPickRow,
  SongRow,
  WanderRow,
} from "./types";

/**
 * `Db` against the real route handlers (session cookie auth, same origin). lib/api.ts picks this
 * over mockDb when Supabase is configured. Anything here is a thin, typed wrapper: view shaping and
 * "NOT IN CONTRACT" enrichment live in lib/real-api.ts.
 */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { credentials: "same-origin", ...init });
  } catch (err) {
    console.error(`${path} unreachable`, err);
    throw new ApiError("Couldn't reach the server.", "unavailable");
  }
  if (res.status === 401) throw new ApiError("Sign in to continue.");
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? "Something went wrong on our end.");
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

// --- who am I -------------------------------------------------------------

type ProfileResponse = {
  profile: { id: string; display_name: string; created_at: string; primary_cluster?: string | null };
  picks: {
    id: string;
    song_id: string;
    tags: string[];
    valence: number;
    energy: number;
    reason_text: string | null;
    is_public: boolean;
    created_at: string;
    songs: { id: string; title: string; artist: string; album_art_url: string | null; spotify_track_id: string | null } | null;
  }[];
};

let myIdPromise: Promise<string> | null = null;

/** The signed-in user's profile id. Cached; cleared by forgetMe() on sign-out. */
export function getMyId(): Promise<string> {
  myIdPromise ??= request<ProfileResponse>("/api/profile?id=me")
    .then((r) => r.profile.id)
    .catch((err) => {
      myIdPromise = null;
      throw err;
    });
  return myIdPromise;
}

export function forgetMe() {
  myIdPromise = null;
}

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);
const profileUrl = (id: string) => `/api/profile?id=${encodeURIComponent(id)}`;

function songRow(s: NonNullable<ProfileResponse["picks"][number]["songs"]>): SongRow {
  return {
    id: s.id,
    title: s.title,
    artist: s.artist,
    mbid: null,
    fallback_key: null,
    resolution_source: "musicbrainz",
    spotify_track_id: s.spotify_track_id,
    album_art_url: s.album_art_url,
    context_summary: null,
    embedding: null,
    created_at: "",
  };
}

/** Full profile response, including the parts of the row Db.getProfile drops (primary_cluster). */
export function fetchProfile(id: string) {
  return request<ProfileResponse>(profileUrl(id));
}

// --- portrait (real mode only; not part of the Db contract) --------------------

/** POST /api/portrait: (re)generate my listening portrait. */
export const generatePortrait = () => post<{ portrait: Portrait }>("/api/portrait");

/** GET /api/portrait: my stored portrait, or null before the first one exists. */
export async function getPortrait(): Promise<Portrait | null> {
  const res = await fetch("/api/portrait", { credentials: "same-origin" });
  if (res.status === 404) return null;
  if (!res.ok) throw new ApiError(res.status === 401 ? "Sign in to continue." : "Your portrait didn't load.");
  return ((await res.json()) as { portrait: Portrait }).portrait;
}

export const httpDb: Db = {
  async getProfile(id): Promise<ProfileRow | null> {
    try {
      const { profile } = await fetchProfile(id);
      return { id: profile.id, display_name: profile.display_name, created_at: profile.created_at };
    } catch (err) {
      console.error(`getProfile(${id}) failed`, err);
      return null;
    }
  },

  async listPicks(id) {
    const { picks } = await fetchProfile(id);
    return picks.flatMap((p): (SongPickRow & { song: SongRow })[] =>
      p.songs
        ? [
            {
              id: p.id,
              profile_id: id,
              song_id: p.song_id,
              tags: p.tags,
              valence: p.valence,
              energy: p.energy,
              reason_text: p.reason_text,
              is_public: p.is_public,
              created_at: p.created_at,
              song: songRow(p.songs),
            },
          ]
        : [],
    );
  },

  insertPick: (pick) => post("/api/picks", pick),

  async updatePick(id, patch) {
    const { pick } = await request<{ pick: SongPickRow }>("/api/picks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    return pick;
  },

  async deletePick(id) {
    await request(`/api/picks?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async getMatches(limit) {
    const { matches } = await request<{ matches: ConfirmedMatchRow[] }>(`/api/match${limit ? `?limit=${limit}` : ""}`);
    return matches;
  },

  async getConnectionCard(otherProfileId): Promise<ConnectionCardRow | null> {
    const [me, res] = await Promise.all([getMyId(), request<{ status: string; card: ConnectionCardJson | null }>(`/api/cards/${encodeURIComponent(otherProfileId)}`)]);
    if (!res.card) return null;
    const [user_a, user_b] = pair(me, otherProfileId);
    return { id: `${user_a}:${user_b}`, user_a, user_b, card_json: res.card, created_at: "" };
  },

  generateConnectionCard: (otherProfileId) => post(`/api/cards/${encodeURIComponent(otherProfileId)}`),

  async wander(limit) {
    const [me, { wanders }] = await Promise.all([getMyId(), post<{ wanders: { profileId: string; displayName: string; card: ConnectionCardJson }[] }>("/api/wander")]);
    return wanders.slice(0, limit ?? wanders.length).map((w): WanderRow => {
      const [user_a, user_b] = pair(me, w.profileId);
      return { profile_id: w.profileId, display_name: w.displayName, card: { id: `${user_a}:${user_b}`, user_a, user_b, card_json: w.card, created_at: "" } };
    });
  },

  async listMessages(_profileId, otherProfileId) {
    const { messages } = await request<{ messages: MessageRow[] }>(`/api/messages${otherProfileId ? `?with=${encodeURIComponent(otherProfileId)}` : ""}`);
    return messages;
  },

  async insertMessage(input) {
    const { message } = await post<{ message: MessageRow }>("/api/messages", input);
    return message;
  },
};
