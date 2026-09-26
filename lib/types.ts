/*
 * Frontend view types vs db/contract.md (checked against main @ ba262ec, which also
 * has the migration and lib/supabase/types.ts; the three agree with each other).
 *
 * The "DB contract rows" section at the bottom mirrors the contract field-for-field.
 * lib/api.ts maps those rows into the view types above; components only see views.
 *
 * Renames / nullability (already handled by the mappers in lib/api.ts):
 *   User.name                 <- profiles.display_name
 *   Song.spotifyId?           <- songs.spotify_track_id (string | null)
 *   Song.source               <- derived: spotify_track_id ? "spotify" : "manual"
 *   Message.fromUserId/sentAt/text <- messages.sender_id / created_at / body
 *   Connection.user/similarity     <- match_profiles.profile_id + display_name / similarity
 *   ConnectionCard.userA/userB are viewer-relative (A = me). connection_cards.user_a/user_b
 *     are id-ordered (user_a < user_b); api.ts flips card_json.evidence when I'm user_b.
 *   ConnectionCard.suggestedOpeners <- card_json.openers
 *   ConnectionCard.meaningfulDifference.summary <- card_json.difference
 *   ConnectionCard.sharedMotivations[0].motivation <- card_json.shared_why
 *
 * UNRESOLVED: flagged, not fixed. Each one needs a DB or product decision:
 *   1. Song identity: frontend song ids are catalog slugs shared across users, used for
 *      overlap counts and Evidence.songIds. songs.id is a per-row uuid, so "same song"
 *      across users only exists via spotify_track_id (nullable) or title+artist.
 *   2. Song.albumArtUrl has no column. Needs a Spotify lookup by spotify_track_id or a new column.
 *   3. songs.reason_text is NOT NULL (and POST /api/songs rejects empty), and songs.is_public
 *      exists. The frontend collects neither a per-song "why" nor per-song privacy.
 *   4. InferredMotivation vs motivations: contract motivations are per-song {label, embedding}.
 *      There is no description, cluster, confidence, evidence[], feedback, isPublic, or note,
 *      so updateMotivation() has nothing to write to. Privacy is per-song in the DB but
 *      per-motivation in the UI.
 *   5. Clusters (GalaxyNode.cluster, Connection.cluster, User.cluster) aren't stored anywhere.
 *   6. Galaxy: match_profiles is target -> top-N only. GalaxyResponse needs every node plus
 *      pairwise edges between *other* users, each with sharedMotivation/sharedSongs/sharedArtists.
 *   7. ConnectionCard: card_json has ONE shared_why and plain-string evidence. The UI renders
 *      1-2 shared motivations, each with a Song object, plus overlap counts and per-side
 *      difference evidence. card_json.suggested_swap_prompt isn't rendered anywhere.
 *   8. card_json perspective bug on main: generateConnectionCard(current, other) writes
 *      evidence.user_a = the *requesting* user, but the row stores user_a = the smaller id.
 *      So evidence.user_a only matches row.user_a when the requester has the smaller id.
 *   9. Song swaps (Message kind "swap", SongSwap) have no table; messages rows are text-only.
 *  10. No conversations table. ConversationSummary/Conversation come from messages grouped
 *      by (user_a, user_b); their cluster has no source (see 5). The contract lists a
 *      `connections` table as an open question.
 *  11. User.avatarUrl, ListeningSignal/ContextTag, and AnalysisResult have no DB home.
 *  12. ME_ID = "me" is a mock id. profiles.id is auth.users.id (uuid), and neither side has auth yet.
 */

export type Song = {
  id: string;
  title: string;
  artist: string;
  albumArtUrl?: string;
  spotifyId?: string;
  source: "spotify" | "manual";
};

export type ContextTag =
  | "late_night"
  | "on_repeat"
  | "commute"
  | "workout"
  | "alone"
  | "with_friends"
  | "studying"
  | "after_a_hard_day"
  | "getting_ready";

export type ListeningSignal = {
  songId: string;
  playCount?: number;
  lateNightShare?: number;
  contextTags: ContextTag[];
};

export type Evidence = {
  kind: "listening_pattern" | "song_context" | "user_tag";
  text: string;
  songIds: string[];
};

export type InferredMotivation = {
  id: string;
  label: string;
  description: string;
  cluster: string;
  confidence: number;
  evidence: Evidence[];
  feedback: "unreviewed" | "confirmed" | "rejected";
  isPublic: boolean;
  note?: string;
};

export type User = {
  id: string;
  name: string;
  avatarUrl?: string;
  songs: Song[];
  motivations: InferredMotivation[];
};

export type AnalysisResult = {
  headline: string;
  motivations: InferredMotivation[];
  highlights: string[];
};

// GET /api/galaxy
export type GalaxyNode = {
  userId: string;
  name: string;
  avatarUrl?: string;
  cluster: string;
  topMotivations: string[];
  isMe: boolean;
};

export type GalaxyEdge = {
  source: string;
  target: string;
  similarity: number;
  sharedMotivation: string;
  sharedSongs: number;
  sharedArtists: number;
};

export type GalaxyResponse = {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  topMatchId?: string;
  status: "ready" | "processing";
};

export type SharedEvidence = { song: Song; text: string };

export type ConnectionCard = {
  userA: string;
  userB: string;
  overlap: { sharedSongs: number; sharedArtists: number };
  sharedMotivations: { motivation: string; evidenceA: SharedEvidence; evidenceB: SharedEvidence }[];
  meaningfulDifference: { summary: string; evidenceA: string; evidenceB: string };
  suggestedOpeners: string[];
};

export type SongSwap = {
  id: string;
  fromUserId: string;
  toUserId: string;
  song: Song;
  reason: string;
  status: "pending" | "returned";
};

// App-level shapes returned by the mock route handlers.

export type Connection = {
  user: Pick<User, "id" | "name" | "avatarUrl">;
  cluster: string;
  similarity: number;
  sharedMotivation: string;
  sharedSongs: number;
  sharedArtists: number;
};

export type Message =
  | { id: string; fromUserId: string; sentAt: string; kind: "text"; text: string }
  | { id: string; fromUserId: string; sentAt: string; kind: "swap"; swap: SongSwap };

export type ConversationSummary = {
  userId: string;
  name: string;
  avatarUrl?: string;
  cluster: string;
  lastMessage?: Message;
};

export type Conversation = {
  user: Pick<User, "id" | "name" | "avatarUrl">;
  cluster: string;
  sharedMotivation?: string;
  messages: Message[];
  suggestedOpeners: string[];
};

export type SpotifyImport = { songs: Song[]; signals: ListeningSignal[] };

// ---------------------------------------------------------------------------
// DB contract rows: field-for-field with db/contract.md on main. Once the backend
// merges, these can become aliases of lib/supabase/types.ts (Database["public"]...).

export type ProfileRow = {
  id: string;
  display_name: string;
  created_at: string;
};

export type SongRow = {
  id: string;
  profile_id: string;
  title: string;
  artist: string;
  spotify_track_id: string | null;
  reason_text: string;
  is_public: boolean;
  created_at: string;
};

export type MotivationRow = {
  id: string;
  song_id: string;
  label: string;
  embedding: number[];
  created_at: string;
};

export type ConnectionCardJson = {
  shared_why: string;
  evidence: { user_a: string; user_b: string };
  difference: string;
  openers: string[];
  suggested_swap_prompt: string;
};

export type ConnectionCardRow = {
  id: string;
  /** Smaller of the two profile ids. */
  user_a: string;
  /** Larger of the two profile ids. */
  user_b: string;
  card_json: ConnectionCardJson;
  created_at: string;
};

export type MessageRow = {
  id: string;
  user_a: string;
  user_b: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type MessageInsert = Pick<MessageRow, "user_a" | "user_b" | "sender_id" | "body">;

/** Row returned by the match_profiles(target_profile_id, match_count) RPC. */
export type MatchProfileRow = {
  profile_id: string;
  display_name: string;
  similarity: number;
};

/**
 * Row-level data access, in contract shapes. lib/api.ts is the only consumer and picks
 * the implementation (lib/mock-db.ts today).
 */
export type Db = {
  getProfile(id: string): Promise<ProfileRow | null>;
  listSongs(profileId: string): Promise<SongRow[]>;
  matchProfiles(targetProfileId: string, matchCount?: number): Promise<MatchProfileRow[]>;
  /** Get-or-generate the cached card for the unordered pair. */
  getConnectionCard(profileId: string, otherProfileId: string): Promise<ConnectionCardRow | null>;
  /** Every message the profile is part of, or only the ones with `otherProfileId`. */
  listMessages(profileId: string, otherProfileId?: string): Promise<MessageRow[]>;
  insertMessage(row: MessageInsert): Promise<MessageRow>;
};
