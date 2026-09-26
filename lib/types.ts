import type { CardThread } from "./portrait";

/*
 * Frontend view types vs db/contract.md (checked against main @ 26a33b3, which also
 * has the migration, lib/supabase/types.ts, and the running route handlers; all agree
 * with each other). Replaces the previous version of this comment, checked against
 * ba262ec — a pre-redesign commit. See MERGE_CHECKLIST.md for the full list of what
 * changed since then (song identity via MusicBrainz, no more motivations table,
 * per-pick embeddings, real session auth, matches arriving pre-evaluated with a card).
 *
 * The "DB contract rows" section at the bottom mirrors the contract field-for-field.
 * lib/api.ts maps those rows into the view types above; components only see views.
 *
 * Renames / nullability (already handled by the mappers in lib/api.ts):
 *   User.name                 <- profiles.display_name
 *   Song.spotifyId?           <- songs.spotify_track_id (string | null)
 *   Song.source               <- derived: spotify_track_id ? "spotify" : "manual"
 *   Message.fromUserId/sentAt/text <- messages.sender_id / created_at / body
 *   Connection.user/similarity     <- ConfirmedMatchRow.profileId + displayName (no similarity score anymore — see #6)
 *   ConnectionCard.userA/userB are viewer-relative (A = me). connection_cards.user_a/user_b
 *     are id-ordered (user_a < user_b); api.ts flips card_json.evidence when I'm user_b.
 *     (main now aligns evidence to this ordering itself before caching — see #8.)
 *   ConnectionCard.suggestedOpeners <- card_json.openers
 *   ConnectionCard.meaningfulDifference.summary <- card_json.difference
 *   ConnectionCard.sharedMotivations[0].motivation <- card_json.shared_why
 *
 * UNRESOLVED: flagged, not fixed. Each one needs a DB or product decision. Numbering
 * kept stable from the previous version where the item still applies; new items appended.
 *   1. Song identity: frontend song ids are catalog slugs shared across users, used for
 *      overlap counts and Evidence.songIds. main's songs.id is a per-row uuid, deduped by
 *      mbid (MusicBrainz) or a title+artist fallback key — closer to what this app wants
 *      than before, but still not the same id space as the mock catalog slugs.
 *   2. Song.albumArtUrl: main now has songs.album_art_url, but nothing populates it yet
 *      (POST /api/picks accepts an optional albumArtUrl from the caller; nothing derives
 *      one from spotify_track_id server-side).
 *   3. STILL OPEN, CHANGED SHAPE: main no longer has a required reason_text or motivations
 *      table. It replaced them with song_picks.tags (1-3 values, fixed taxonomy in
 *      lib/tags.ts on main) and valence/energy (-1..1 floats, from a circular slider),
 *      BOTH REQUIRED by POST /api/picks. This app's onboarding collects none of tags,
 *      valence, or energy — it collects songs, then infers open-ended motivations with
 *      confidence scores (analyzeMusic -> AnalysisResult, reviewed via MotivationCard's
 *      confirm/reject). These are two different, incompatible "why" models:
 *        - main: user explicitly picks a few fixed tags + drags one point on a 2D slider,
 *          per song, before saving.
 *        - this app: AI infers open-ended motivations after the fact, user confirms/rejects.
 *      Reconciling this needs a product decision, not just a mapping. Options include:
 *        (a) add a tag-tap + slider step to onboarding (a real UI addition) and drop or
 *            demote the confirm/reject motivation review,
 *        (b) keep the AI-inference UX and have it choose valence/energy/tags on the
 *            user's behalf (loses the "your own subjective placement" point of the
 *            slider, which main's matching design leans on), or
 *        (c) synthesize placeholder tags/valence/energy just to satisfy the route while
 *            keeping the current onboarding UX unchanged (fastest, but the matching
 *            quality point of the slider is lost, and it isn't a "real" placement).
 *      Nothing in this file decides between these — see MERGE_CHECKLIST.md.
 *   4. InferredMotivation vs song_picks: still no cluster/confidence/evidence[]/feedback/
 *      isPublic/note columns anywhere in main's schema. Same gap as before, just against
 *      a different table (song_picks instead of motivations). updateMotivation() still
 *      has nothing to write to.
 *   5. Clusters (GalaxyNode.cluster, Connection.cluster, User.cluster) aren't stored anywhere.
 *   6. CHANGED: GET /api/match on main no longer returns a raw similarity score to browse —
 *      every entry has already passed an AI evidence-check and comes with a full
 *      Connection Card attached (ConfirmedMatchRow). There's no "top-N by similarity, then
 *      fetch a card" step anymore; the galaxy's per-edge similarity/sharedMotivation/
 *      sharedSongs/sharedArtists still have no DB source (unchanged from before), but the
 *      *set* of who you match with now already includes why, which may simplify
 *      GalaxyResponse's design once addressed.
 *   7. ConnectionCard: card_json has ONE shared_why and plain-string evidence. The UI renders
 *      1-2 shared motivations, each with a Song object, plus overlap counts and per-side
 *      difference evidence. card_json.suggested_swap_prompt isn't rendered anywhere.
 *   8. FIXED on main: the card_json perspective bug (generateConnectionCard writing
 *      evidence.user_a for the requester, not for whichever id is smaller) is resolved —
 *      main now aligns evidence to the row's user_a/user_b ordering before caching or
 *      returning a card (lib/matching/alignCardEvidence.ts). api.ts's existing "flip if
 *      I'm user_b" logic is still correct and needs no change.
 *   9. Song swaps (Message kind "swap", SongSwap) have no table; messages rows are text-only.
 *  10. No conversations table. ConversationSummary/Conversation come from messages grouped
 *      by (user_a, user_b); their cluster has no source (see 5). The contract no longer
 *      lists a `connections` table as an open question — it was dropped, not resolved.
 *  11. User.avatarUrl, ListeningSignal/ContextTag, and AnalysisResult have no DB home.
 *  12. ME_ID = "me" is a mock id. profiles.id is auth.users.id (uuid). main now has real
 *      session-based auth (lib/supabase/serverAuth.ts) — "me"-scoped routes derive the
 *      user from the session and no longer accept a client-supplied profileId at all, so
 *      this app needs a real Supabase Auth session before Step 1 in MERGE_CHECKLIST.md
 *      can work, not just before ME_ID gets a real value.
 *  13. NEW: POST /api/picks calls MusicBrainz (rate-limited to 1 req/sec) before Gemini.
 *      Saving many songs at once (e.g. a Spotify import of 24 tracks) will take at least
 *      ~24 seconds sequentially if each is a new catalog entry, worse than the old
 *      "24 slow Gemini calls" concern this file already flagged. Batching/parallelizing
 *      insertPick calls doesn't help against a single shared rate limit; consider a
 *      pending/progress UI state for onboarding instead of an await-then-navigate flow.
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

/** A specific, human listening moment: what someone would say out loud, plus the song behind it. */
export type ListeningMoment = {
  text: string;
  song: Song;
  playlist?: string;
  when: string;
};

export type User = {
  id: string;
  name: string;
  avatarUrl?: string;
  songs: Song[];
  motivations: InferredMotivation[];
  /** NOT IN CONTRACT: mocked in lib/texture.ts. */
  listening?: ListeningMoment;
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
  /** Hopped galaxies only: how similar this person is to the real viewer, when known. */
  youSimilarity?: number;
  /** The strongest why: color, filters, short labels. Position uses `whys`. */
  cluster: string;
  /**
   * Listening profile over the five whys, shares summing to ~1. Placement sits people at the weighted
   * center of their top two. Absent means one-hot on `cluster` (e.g. the http galaxy until the
   * profile stores the mix; see MERGE_CHECKLIST.md "Why mix").
   * Song stars: the share of listeners per why.
   */
  whys?: Partial<Record<string, number>>;
  /** Top two whys were too close to call; drawn between them. */
  blended?: boolean;
  /** Song stars: listeners span two or more whys. */
  bridge?: boolean;
  topMotivations: string[];
  isMe: boolean;
  /** "song" stars are the song layer (lib/song-layer.ts); everything else is a person. */
  kind?: "song";
  /** Song stars: how many people share it. */
  weight?: number;
  /** An ambient far star: distant from you, but with a strong thread. Drawn dim; tapping explains. */
  far?: boolean;
  /**
   * Home galaxy only. "connected": a completed Song Handshake, in orbit around you. "nearby": a
   * suggestion from matching, drawn faint outside your orbit. "arriving": mid-flight into orbit.
   */
  relationship?: "connected" | "nearby" | "arriving";
  /** Connected: how close their orbit is, 0 (outer, newer or quieter) .. 1 (inner, frequent). */
  orbit?: number;
  /** A member of a distant community galaxy (GalaxyDestination.id): drawn there, not at home. */
  destinationId?: string;
};

export type GalaxyEdge = {
  source: string;
  target: string;
  similarity: number;
  sharedMotivation: string;
  sharedSongs: number;
  sharedArtists: number;
};

/**
 * The galaxy is a bounded window onto your neighborhood, not everyone. `limit` caps the nodes
 * drawn (default lib/galaxy-sample.ts DEFAULT_BUDGET). More of one cluster comes from getGalaxyMore.
 */
/** `center`: hop to another star's galaxy (a profile id already in your window). */
export type GalaxyQuery = { limit?: number; center?: string };

/** "More here": the next people in one cluster, as arrivals so they fade in without moving anyone. */
export type GalaxyMore = {
  arrivals: { node: GalaxyNode; edges: GalaxyEdge[] }[];
  /** Still hidden in this cluster after this page. */
  remaining: number;
};

export type GalaxyResponse = {
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  topMatchId?: string;
  /** Set only when the window is centered on another star (a hop); the viewer is then a dimmed anchor node with isMe. */
  centerId?: string;
  status: "ready" | "processing";
  /** True when people were left out to stay within the budget. */
  sampled?: boolean;
  /** Everyone not drawn, so the far field can show as density instead of nodes. */
  hidden?: { total: number; byCluster: Record<string, number> };
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

/**
 * Wander: someone who picked the same song as you but feels it differently.
 * Viewer-relative (A = me), mapped from a `kind: "contrast"` card_json.
 * `song` resolves from card_json.shared_song by title + artist (NOT IN CONTRACT: mismatch #1).
 */
export type ContrastCard = {
  userA: string;
  userB: string;
  song: Song;
  /** The thread: the one song you both picked. */
  sharedThread: string;
  feelA: string;
  feelB: string;
  /** How you differ. */
  difference: string;
  suggestedOpeners: string[];
  swapPrompt: string;
};

export type WanderEntry = {
  user: { id: string; name: string; cluster: string };
  card: ContrastCard;
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
  /** Covers shown on the row: shared songs first, then their songs by shared artists (max 4). NOT IN CONTRACT: see MERGE_CHECKLIST.md. */
  evidenceSongs: Song[];
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
  /** Songs traded in this thread. */
  threadSongs?: number;
  /** Whose move it is in the Song Swap thread (see lib/thread.ts). Derived from the messages, not stored. */
  turn?: "mine" | "theirs" | "even" | "open";
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
// DB contract rows: field-for-field with db/contract.md on main @ 26a33b3.
// Replaces the previous section (checked against ba262ec, a pre-redesign
// commit whose songs/motivations schema no longer exists on main). See
// MERGE_CHECKLIST.md for what changed and why, and for the open product
// decision this section can't resolve on its own (tags/valence/energy vs.
// this app's AI-inferred-motivations onboarding UX).

export type ProfileRow = {
  id: string;
  display_name: string;
  created_at: string;
};

/** Shared catalog: one row per unique resolved song, not per user. */
export type SongRow = {
  id: string;
  title: string;
  artist: string;
  mbid: string | null;
  fallback_key: string | null;
  resolution_source: "musicbrainz" | "gemini_fallback";
  spotify_track_id: string | null;
  album_art_url: string | null;
  context_summary: string | null;
  embedding: number[] | null;
  created_at: string;
};

/**
 * One row per user per song. Replaces the old per-user `songs` row +
 * `motivations` table entirely — there is no motivations table on main
 * anymore. `tags`/`valence`/`energy` are the "why" signal now; `reason_text`
 * is optional bonus color, never required (POST /api/picks no longer
 * rejects an empty one — see mismatch #3 in MERGE_CHECKLIST.md, since this
 * app's onboarding doesn't collect any of tags/valence/energy/reason yet).
 */
export type SongPickRow = {
  id: string;
  profile_id: string;
  song_id: string;
  /** 1-3 values from the fixed taxonomy in lib/tags.ts on main. Different taxonomy than this app's ContextTag. */
  tags: string[];
  /** -1..1, sad/negative <-> happy/positive. */
  valence: number;
  /** -1..1, calm <-> intense. */
  energy: number;
  reason_text: string | null;
  is_public: boolean;
  created_at: string;
};

/**
 * Body for POST /api/picks on main. The route resolves song identity
 * (MusicBrainz, Gemini fallback) and computes the pick's embedding itself
 * server-side — callers never send a song_id or an embedding, only this.
 * `tags`, `valence`, and `energy` are required by the route (tags: 1-3
 * items, valence/energy: -1..1).
 */
export type PickInsert = {
  title: string;
  artist: string;
  spotifyTrackId?: string | null;
  albumArtUrl?: string | null;
  tags: string[];
  valence: number;
  energy: number;
  reasonText?: string;
  isPublic?: boolean;
};

export type ConnectionCardJson = {
  shared_why: string;
  evidence: { user_a: string; user_b: string };
  difference: string;
  openers: string[];
  suggested_swap_prompt: string;
  /** Absent means a regular match card. "contrast" cards come from Wander (same song, different feeling). */
  kind?: "match" | "contrast";
  shared_song?: { title: string; artist: string };
  /** Whole-profile AI assessment, 0..100 (sets the match order). Absent on older cards. */
  score?: number;
  rationale?: string;
  /** 1–2 specific shared threads, each anchored by a song on each side. Absent on older cards. */
  threads?: CardThread[];
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

/** Body for POST /api/messages on main. sender_id is derived from the session, not sent by the client. */
export type MessageInsert = { otherProfileId: string; text: string };

/**
 * A single item from GET /api/match on main. Unlike the old match_profiles
 * RPC (a raw similarity score), every entry here has already passed the AI
 * evidence-check and comes with its Connection Card attached — a match IS
 * a card, not something you separately fetch a card for afterward. There
 * is no raw similarity score exposed to callers.
 */
export type ConfirmedMatchRow = {
  profileId: string;
  displayName: string;
  card: ConnectionCardJson;
  /** Real cosine similarity of the best pick pair (GET /api/match). Absent in the mock. */
  similarity?: number;
  /** The AI's whole-profile score (0..100) that orders matches. Absent in the mock and on older cards. */
  score?: number | null;
  /** Their primary cluster, if computed. */
  cluster?: string | null;
  /** Their public songs, so the list can show covers without a request per person. */
  songs?: { id: string; title: string; artist: string; album_art_url: string | null }[];
};

/** One confirmed Wander result: the candidate plus the contrast card already cached for the pair. */
export type WanderRow = {
  profile_id: string;
  display_name: string;
  card: ConnectionCardRow;
};

/**
 * Row-level data access, in contract shapes. lib/api.ts is the only consumer and picks
 * the implementation (lib/mock-db.ts today).
 *
 * All "me"-scoped methods take no profile id argument on purpose: main
 * derives the acting user from the real Supabase session (see CLAUDE.md's
 * "Auth" section), not a client-supplied id. Calling any of these before
 * this app has real auth wired up needs a decision — see
 * MERGE_CHECKLIST.md mismatch #12.
 */
export type Db = {
  getProfile(id: string): Promise<ProfileRow | null>;
  /** Picks for `id`, joined with their song. If `id` isn't the session's own user, private picks are already filtered out server-side. */
  listPicks(id: string): Promise<(SongPickRow & { song: SongRow })[]>;
  insertPick(pick: PickInsert): Promise<{ song: SongRow; pick: SongPickRow }>;
  /** Already evidence-checked and card-bearing — see ConfirmedMatchRow. */
  getMatches(limit?: number): Promise<ConfirmedMatchRow[]>;
  /** Cached card for (me, otherProfileId), or null if none exists yet. */
  getConnectionCard(otherProfileId: string): Promise<ConnectionCardRow | null>;
  /** Generates (and caches) a card for (me, otherProfileId) on demand. Can come back as insufficient evidence instead of a card. */
  generateConnectionCard(
    otherProfileId: string,
  ): Promise<{ status: "match"; card: ConnectionCardJson } | { status: "insufficient_evidence" }>;
  /** Wander: same song, different feeling. Explicit user action only; each row's card is `kind: "contrast"`. */
  wander(limit?: number): Promise<WanderRow[]>;
  /** No read route exists on main; reads go through Supabase Realtime directly once this app has auth. */
  listMessages(profileId: string, otherProfileId?: string): Promise<MessageRow[]>;
  insertMessage(input: MessageInsert): Promise<MessageRow>;
};
