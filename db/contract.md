# Backend ⇄ Database Contract

This is the schema the backend route handlers assume exists in Supabase.
It's the interface, not the migration. As of 2026-09-26, @anish is building
the actual migration personally (schema ownership moved from a teammate).

**Schema change 2026-09-26 (v2):** supersedes both the original
essay-based schema (`reason_text` required, per-user `songs`,
`motivations` table) and the first tag/slider redesign (shared catalog +
profile-averaged embedding). Two things changed:
1. Song identity now resolves through MusicBrainz first, Gemini only as a
   fallback — see CLAUDE.md's "How matching works" section.
2. Matching is **per-pick**, not per-profile-average. Every individual
   pick (one user + one song + their tags + their valence/energy) gets its
   own embedding. There is no `profiles.embedding` column anymore.

See `CLAUDE.md` for the Spotify compliance rule that still shapes this
schema: Spotify data (title/artist/album art) is fine to store, but the
`songs` catalog's `context_summary`/`embedding` are generated from
title+artist strings only, never from a raw Spotify API payload or
anything derived from one.

## Extensions
- `vector` (pgvector) must be enabled.

## Tables

### Private listening imports (migrations `20261001000000`, `20261002000000`)

`LISTENING_ENABLED` and `DISCOVERY_ENABLED` default off. Imported history never
creates a `songs` or `song_picks` row. Last.fm and ListenBrainz are unverified,
username-only sources; no provider credential is stored.

- `listening_connections`: one unverified public-username connection per
  `(profile_id, provider)`. A username change advances `generation`, which fences
  writes from an older fetch. Provider is `lastfm` or `listenbrainz`.
- `listening_preferences`: owner row containing the selected primary connection,
  IANA timezone, exploration setting, 120-day raw-retention default, and monotonic
  `input_revision`. A composite foreign key proves the primary connection belongs
  to the same profile; primary-source or timezone changes increment the revision.
- `listening_tracks`: profile-scoped, conservative recording identities. Unknown
  imports remain here with `identity_status = 'unresolved'`; only an explicit,
  reliable match may set nullable `catalog_song_id`.
- `listening_track_aliases`: profile-scoped provider identifiers with an explicit
  namespace (`musicbrainz_recording` and `listenbrainz_msid` are distinct), method,
  and provenance.
- `listening_events`: owner/connection/track, generation, UTC playback time and a
  same-source idempotency fingerprint. Composite foreign keys prevent cross-owner
  references. The fallback identity intentionally collapses indistinguishable rows
  for the same recording at the same second; different timestamps remain separate.
- `listening_sync_jobs`: fixed query bounds, provider continuation, checkpoint,
  random lease, retry time and bounded counters. A partial unique index permits one
  queued/running/retrying job per connection.
- `listening_daily_tracks`: replaceable per-local-day aggregates. Page commits mark
  `listening_dirty_dates`; later aggregation rebuilds the whole affected date rather
  than incrementing counts during a retry.

Owner-only RLS `select` applies to connections, preferences, tracks, aliases, events,
and daily aggregates. Authenticated/anonymous clients receive no table mutation
grants. Job and dirty-date internals have no browser policy or grant. Service-role-only
RPCs `claim_listening_job`, `commit_listening_page`, `release_listening_job`, and
`fail_listening_job` enforce lease token, connection generation, and checkpoint
revision. Page commit resolves private tracks, inserts events, marks dirty dates, and
advances the checkpoint in one database transaction. Lease expiry is based on the
database clock.

Migration `20261002000000` adds service-role-only connection lifecycle RPCs. A
configure/reconfigure transaction cancels earlier jobs and queues a fixed 90-day,
newest-first backfill. Manual sync reuses an active job or queues a fixed 48-hour
reconciliation range after the first successful import. Disconnect advances the
connection generation before cancelling work and deleting source events, aggregates,
aliases, and now-unreferenced private track identities, so a fetch already in flight
cannot commit. `listening_provider_pacing` and its reservation RPC coordinate request
spacing across worker processes; it is not browser-readable.

Authenticated routes expose only owner-scoped status and use `private, no-store`.
Mutations check same-origin browser metadata and call service-role RPCs after deriving
the profile from the signed-in session. The optional Next.js `after()` kick improves
latency, while `scripts/sync-listening.ts` is the durable, host-independent consumer.

### Private taste snapshots (migration `20261003000000`)

- `taste_snapshots` is an immutable, owner-scoped publication record keyed by input
  revision, algorithm version, selected connection generation, computation time and
  timezone. It stores explicit coverage/count fields and distinguishes empty, short,
  and established evidence.
- `taste_interests` stores bounded artist-led groups with stable normalized-artist
  keys, recent/core weights, confidence, evidence-day counts and representative
  private track references. Labels come from observed artist credits; they are not
  generated moods or genres.
- `listening_preferences.active_taste_snapshot_id` points to the last complete
  snapshot. The previous pointer remains usable while a replacement is calculated.
- A new dirty-date trigger advances the selected source's input revision once per
  newly affected date. `rebuild_listening_daily_tracks` reconstructs all retained
  local dates using the selected IANA timezone. `publish_taste_snapshot` locks and
  rechecks revision, source ownership/generation, and absence of active sync work
  before inserting interests and swapping the pointer in one transaction.

The version-1 pure scorer applies `log1p(min(daily plays, 5))`, 7-day recent and
60-day core half-lives, separate song/artist normalization, and a 40% artist
dominance cap. Rolling last-seven and previous-seven play counts remain separate
from decayed affinity. A completed sync recomputes even when it imported zero new
events, so elapsed time changes the snapshot without mislabeling stale sync as
inactivity. `GET /api/listening/summary` is private/no-store and reports snapshot
freshness separately from provider sync state.

### Private discovery (migration `20261004000000`)

- `listening_preferences.discovery_feedback_revision` versions fast-changing
  recommendation state independently of the slower taste snapshot.
- `discovery_batches` pins a taste snapshot, optional visible anchor song,
  exploration mode, algorithm version, public-catalog watermark, feedback revision,
  and six-hour expiry. At most 24 candidates are published; only the newest eight
  batches per profile are retained.
- `discovery_candidates` stores one ranked catalog song per batch, its pool and
  interest key, normalized component scores, a typed evidence object, and factual
  source attribution. It never stores private listener history from another user.
- `discovery_events` records validated, idempotent actions against an owned
  candidate. Strong actions advance the feedback revision. `discovery_saves` is a
  private collection and is deliberately separate from authored `song_picks`.

`discovery_catalog_candidates` is service-role-only, requires the caller's active
taste snapshot, accepts at most 300 result paths, and derives candidates from public
picks plus the caller's own catalog-linked rediscovery history. Public-overlap paths
are capped at five songs per contributing profile. `publish_discovery_batch` locks
and rechecks snapshot and feedback revisions before atomically inserting the batch.
`record_discovery_feedback` proves candidate ownership, deduplicates the client key,
and applies saves/revision changes in the same transaction. All discovery tables are
owner-selectable but browser clients have no mutation grants. Before serializing a
cached recommendation, the service rechecks every contributing pick is still public
and drops candidates with malformed or revoked evidence.

### `profiles`
| column | type | notes |
|---|---|---|
| id | uuid, PK | = `auth.users.id` |
| display_name | text | |
| primary_topic_cluster_id | uuid, FK -> topic_clusters.id, nullable | replaces the old `primary_cluster` text column (migration `20260929000000`, data model only — see `topic_clusters` below). Null until someone has a pick |
| primary_cluster | text, nullable, one of the five legacy ids | **kept during the transition** (the migration was split on 2026-09-27 to be additive): the galaxy RPCs and several app readers still use it, and `refreshPrimaryCluster` keeps it current with the tag vote. Dropped in a later migration together with the app-wiring phase |
| avatar | jsonb, nullable | profile icon: illustrated-face settings (`Face` in `lib/avatar.ts`: color/style indexes, glasses, expression). Null = the face generated from `display_name`. Written only by `PATCH /api/avatar` (service role, validated by `sanitizeFace`). Migration `20260930000000` |
| avatar_url | text, nullable | public URL of an uploaded photo in the `avatars` storage bucket (`<profile id>.jpg`, with a `?v=` version); overrides `avatar` wherever icons show. Written only by `POST/DELETE /api/avatar/photo` (service role). Migration `20260930000000` |
| created_at | timestamptz | default now() |

No `embedding` column — matching lives entirely on `song_picks` now.

Both icon columns are readable by any signed-in user (the existing profiles select policy), since icons are
shown to everyone; `authenticated` still may only update `display_name`. Storage bucket `avatars`
(same migration): public read, JPEG only, 1 MB limit, no user write policies — uploads and deletes go
through the route with the service role. Until the migration is applied, `GET /api/avatar` returns
everyone's default face and the save routes answer 503.

### `topic_clusters` (migration `20260929000000`) — replaces the hard-coded 5-value cluster enum
| column | type | notes |
|---|---|---|
| id | uuid, PK | default gen_random_uuid() |
| label | text | full motivation label, e.g. "When it's too quiet at home" |
| short | text | short label for compact UI |
| description | text, nullable | one sentence, spoken to the person ("you"); the 5 seed rows have one, later ones are written by the recompute job's naming call |
| color | text | hex, for the galaxy visualization |
| centroid | vector(768), nullable | mean of member profiles' topic vectors (mood-stripped pick embeddings, see `topicVectorFor` in `lib/matching/topicClusterVector.ts`); null until `scripts/recompute-topic-clusters.ts` has run at least once |
| member_count | int | kept in sync by `scripts/recompute-topic-clusters.ts` each run; the migration's insert is a one-time backfill count |
| created_at | timestamptz | default now() |
| superseded_by | uuid, FK -> topic_clusters.id, nullable | lets a cluster be retired into a merged successor instead of deleted; not yet written by anything — the recompute job (below) reuses/renames a drifted cluster in place rather than superseding it, and never auto-merges or auto-retires one |

Seeded with the current 5 clusters (`lib/clusters.ts` CLUSTER_IDS) as literal rows so
`profiles.primary_topic_cluster_id` could be backfilled 1:1 from the old
`profiles.primary_cluster` text values on the same migration. Readable by any
authenticated user (RLS); only the service role writes it.

**Recompute job** (`scripts/recompute-topic-clusters.ts`, Phase 2 — run by hand, a cron job
later): a batch job over everyone's picks, not inline in any route handler.
1. **Input**: each profile's topic vector — the average of their picks' embeddings with the
   mood dims stripped first (`topicVectorFor`/`stripMood` in `lib/matching/topicClusterVector.ts`
   strip `song_picks.embedding`'s last 2 (valence/energy) dims, since mood isn't "topic"; no
   portrait-level vector exists yet to prefer instead). Profiles with no picks are skipped.
2. **Algorithm**: HDBSCAN (`lib/matching/hdbscan.ts` — a from-scratch implementation; the
   available npm packages were either alpha-quality or only build the single-linkage tree, not
   the density-based condensing HDBSCAN needs) over cosine distance, producing a noise bucket
   (label `-1`) for profiles that don't fit any cluster — that maps directly onto the
   `'unassigned'` fallback `galaxy_pool`/`galaxy_cluster_counts` already treat a null cluster as.
3. **Reuse/naming**: each HDBSCAN cluster is matched to the nearest existing `topic_clusters` row
   by centroid cosine similarity. Similarity ≥ 0.85 reuses that row's id (updating its centroid
   and `member_count`); below 0.95 similarity counts as "changed enough" to also re-name it. A
   cluster with no close match is newly inserted. Either way, naming is one `generateJson` call
   (`lib/gemini/nameTopicCluster.ts`, same Flash → Flash-Lite fallback as portraits) given ~10
   sample picks' `{title, artist, tags}` from real members — plain strings only, never raw
   embeddings, and it only returns `{label, short, description}`, never a membership decision.
4. **Assignment + stability rule** (`applyStabilityMargin`/`assignNearestCluster` in
   `lib/matching/assignTopicCluster.ts`, `CLUSTER_STABILITY_MARGIN = 0.2`): a profile only moves
   off its current `primary_topic_cluster_id` when another cluster's centroid is more than 20%
   closer (cosine distance) than its current one's — prevents flapping between two similar
   clusters on every run. HDBSCAN noise (`-1`) always clears the assignment (no margin check: a
   structural "doesn't fit anywhere" verdict isn't a close call between two options); a profile
   with no prior cluster is placed directly.
5. Never applied to the hosted project's data until migration `20260929000000` is applied there
   first (see above — `galaxy_pool`/`galaxy_cluster_counts` and several app files still expect
   the pre-migration `profiles.primary_cluster` column and haven't been re-wired yet).

**`lib/matching/refreshPrimaryCluster.ts`** shrank in Phase 2 to the cheap half only: on every new
pick (and lazily for the viewer on galaxy load), it assigns the profile to its nearest *existing*
`topic_clusters` centroid (same stability rule, no LLM, no re-clustering). It returns `null`
whenever no `topic_clusters` row has a centroid yet — i.e. always, until the recompute job above
has run at least once. `lib/cluster-assign.ts`'s tag/slider heuristic (`primaryClusterFor`) is no
longer used for this; the file and its other exports (`pickWhy`, used by
`lib/matching/galaxySongs.ts` for per-pick "why", and `whyMixFor`) are unchanged.

**Phase 3 (visualization) — done, but not yet fed real ids.** The galaxy UI no longer assumes
exactly five clusters:
- `GET /api/clusters` (session client, RLS-gated) returns every non-superseded `topic_clusters`
  row as `{id, label, short, description, color}[]`.
- `lib/clusters.ts`'s `getCluster`/`clusterForLabel` read from an in-memory cache seeded with the
  five static entries (so mock mode, and real mode before the fetch resolves, still work), and
  `primeClusters()` merges `GET /api/clusters`'s rows in on top. `components/cluster-cache-provider.tsx`
  calls it once per page load, in real-data mode only, from the root layout.
- `lib/constellation-shapes.ts`'s five hand-drawn asterisms are gone. `shapeSlot(clusterId, index)`
  now generates a deterministic point-ring from a hash of the cluster's *id* — works for any id,
  including ones the recompute job discovers later, at the cost of the "real constellation" flavor
  (Lyra, Orion, ...), which was never shown in the UI anyway.
- `lib/galaxy-layout.ts`'s `anchor()` places however many distinct clusters are actually present
  (`countClusters`) evenly around the ring, in a slot chosen by `hash(clusterId) % clusterCount`
  rather than the cluster's index in some array — so a newly-discovered cluster mostly doesn't
  renumber everyone else's anchor the way an index-based scheme would.
- **Not done here**: the galaxy window itself (`lib/matching/galaxyWindow.ts`) and `lib/real-api.ts`
  still read the pre-migration `profiles.primary_cluster` text column, so in real mode every node's
  `cluster` is still one of the five static ids until that app-wiring phase (noted above) rewires
  them to `primary_topic_cluster_id`. The visualization layer is ready for arbitrary cluster ids
  today; it just isn't receiving any yet.

### `songs` — shared catalog, one row per unique resolved song
| column | type | notes |
|---|---|---|
| id | uuid, PK | default gen_random_uuid() |
| title | text | canonical title (from MusicBrainz when resolved, else as typed) |
| artist | text | canonical artist (same rule) |
| mbid | text, unique, nullable | MusicBrainz ID — primary dedup key when present |
| fallback_key | text, unique, nullable | `lower(trim(title)) \|\| '::' \|\| lower(trim(artist))`, used as the dedup key only when `mbid` is null (MusicBrainz couldn't resolve it) |
| resolution_source | text | `'musicbrainz'` or `'gemini_fallback'` — which path identified this song |
| spotify_track_id | text, nullable | for display/album art only — **never** passed to any LLM |
| album_art_url | text, nullable | |
| context_summary | text, nullable | Gemini's mood/theme description of the song, generated once from `{title, artist}` |
| embedding | vector(768), nullable | generated once alongside `context_summary`, regardless of which resolution path found the song. 768 = `gemini-embedding-001` output size |
| created_at | timestamptz | default now() |

At least one of `mbid` / `fallback_key` must be non-null; whichever is
present is the uniqueness/dedup key backend checks before inserting.

### `song_picks` — one row per user per song, replaces `user_songs`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| profile_id | uuid, FK -> profiles.id | |
| song_id | uuid, FK -> songs.id | |
| tags | text[] | 1-3 values from the fixed taxonomy in `lib/tags.ts` (not a DB table) |
| valence | float, range -1..1 | this user's circular-slider placement for this song: sad/negative <-> happy/positive |
| energy | float, range -1..1 | same slider, perpendicular axis: calm <-> intense |
| embedding | vector(770), not null | computed at insert time by `buildPickEmbedding` (`lib/matching/pickEmbedding.ts`): the song's 768-dim `songs.embedding` **scaled to unit length**, then this pick's `valence`/`energy` × `EMOTION_WEIGHT` (0.7, `lib/emotion.ts`). If the formula or weight changes, recompute every row with `scripts/recompute-pick-embeddings.ts` |
| reason_text | text, nullable | optional bonus free text, never required by the UI |
| is_public | boolean | default true — privacy control, hide from matching/cards shown to others |
| created_at | timestamptz | default now() |

Unlike v1, there is no aggregation step anywhere — `song_picks.embedding`
is set when the row is inserted and only rewritten by `scripts/recompute-pick-embeddings.ts` when the formula changes.

### `connection_cards`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| user_a | uuid, FK -> profiles.id | store the smaller of the two ids here (unordered pair convention) |
| user_b | uuid, FK -> profiles.id | store the larger of the two ids here |
| card_json | jsonb | shape: `{ shared_why, evidence: { user_a, user_b }, difference, openers[], suggested_swap_prompt, kind?, shared_song? }`. `kind` is `"match"` when absent. Match cards from the whole-profile assessment (`lib/gemini/assessConnection.ts`) also carry `score` (0–100, orders matches; computed in code from `rubric` — Gemini's categorical `{ specificity, evidence, conversation }` judgments — plus thread count and how close the anchor songs sit on the mood circle, never asked of the model directly), `rubric`, `rationale` (internal, not shown) and `threads[]` (1–2 of `{ why, song_a: {title, artist}, song_b: {title, artist}, evidence_a, evidence_b }`, `_a` = the row's `user_a`); older cards lack them. `"contrast"` cards come from Wander (see below): `shared_why` is the one song both picked, `evidence` is how each person feels it, `difference` is the gap, and `shared_song` is `{ title, artist }` from our own `songs` row. |
| created_at | timestamptz | |

Unique constraint on `(user_a, user_b)`. Only rows where the AI assessment
(see CLAUDE.md) actually confirmed a match get inserted — an
"insufficient evidence" result is never cached here.

### `profile_portraits` — one AI listening portrait per profile (migration `20260927030000`)
| column | type | notes |
|---|---|---|
| profile_id | uuid, PK, FK -> profiles.id (on delete cascade) | |
| portrait | jsonb | `lib/portrait.ts` `Portrait`: `{ headline, highlights[3], motivations[{ label, description, cluster, confidence, evidence[{ text, songTitles[] }] }], seeks, tensions? }` |
| pick_count | int | public picks it was generated from; a different count means it's stale |
| model | text | Gemini model that wrote it |
| updated_at | timestamptz | |

Written only by the service role (`upsertPortrait` in `lib/matching/portraits.ts`, via
`POST /api/portrait`, `scripts/generate-portraits.ts` and the seed). Owner-only `select` for
`authenticated` (RLS), so `GET /api/portrait` reads it with the session client. Other people's
portraits are read only server-side, as input to the connection assessment; they're never returned
to another user, and cards must not quote them.

### `song_tags` — unused
From the dropped AI-tags experiment (migration `20260928010000`, applied to the hosted project):
`song_tags (song_key pk, title, artist, tags jsonb, model, created_at)` and a
`song_picks.tag_whys text[]` column. Nothing on `main` reads or writes either; safe to drop.
Pick tags are the fixed feelings in `lib/tags.ts` (or the original tags on older picks).

### `messages`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| user_a | uuid | unordered pair, same convention as `connection_cards` |
| user_b | uuid | |
| sender_id | uuid, FK -> profiles.id | |
| body | text | |
| created_at | timestamptz | Supabase Realtime subscribes to this table directly |

Reads: `GET /api/messages[?with=<profileId>]` returns the signed-in user's messages, oldest
first, through the **session** client, so the "Participants can view messages" RLS policy
scopes it. The frontend polls it until the Realtime subscription is built.

## RPCs

### `match_picks(target_profile_id uuid, match_count int default 10)`
Returns `table (profile_id uuid, display_name text, song_pick_id uuid,
target_pick_id uuid, similarity float)` — pgvector nearest-neighbor search
over `song_picks.embedding`, comparing every public pick belonging to
other profiles against every pick belonging to `target_profile_id`,
grouped so only the single best-matching pick pair per candidate profile
is returned (same grouping pattern as the old `match_profiles`, just
retargeted at `song_picks` instead of `motivations`). Excludes
`target_profile_id`'s own profile and non-public candidate picks. The
`song_pick_id`/`target_pick_id` pair is only a pre-filter and a hint: each
uncached candidate (at most 5 per request) is then assessed as a whole
profile against the requester — both portraits and every public pick —
by `lib/gemini/assessConnection.ts`, which confirms or drops it and scores
it 0–100. `GET /api/match` orders by that score (cards without one fall
back to `similarity × 100`) and returns both `score` and `similarity`.

### `wander_picks(target_profile_id uuid, match_count int default 6, min_emotion_gap float default 0.9)`
Returns `table (profile_id uuid, display_name text, song_pick_id uuid,
target_pick_id uuid, emotion_gap float)`. The opposite question from
`match_picks`: same **song** (`song_picks.song_id` equal), far apart in
**feeling** (Euclidean distance between the two picks' `(valence, energy)`
is at least `min_emotion_gap`). One row per candidate profile — the pick pair
with the widest gap — ordered by `emotion_gap` descending. Excludes the
target's own profile, non-public candidate picks, and any pair that already
has a `connection_cards` row (cards are never regenerated). Uses `song_id`
equality, so it is an index lookup, not a vector search.

Called only from `lib/matching/findWander.ts`, only when the user taps
Wander (`POST /api/wander`). Each candidate then goes through
`lib/gemini/evaluateContrast.ts`, which either returns a contrast card or
"insufficient evidence" (candidate dropped, never cached). Confirmed contrast
cards are upserted into `connection_cards` like any other card, so a pair
that already has a card of either kind is never asked about again.

### Galaxy window: `galaxy_pool`, `galaxy_cluster_counts` (SQL in `supabase/migrations/20260927010000_galaxy_window.sql`)
The front page draws a **bounded window**, never everyone. `GET /api/galaxy?limit=`
(`lib/matching/galaxyWindow.ts`) returns at most `limit` people (default 200) plus
`hidden: { total, byCluster }`, which the UI draws as dust around each cluster.
The window is you, your top global matches, up to 2 ambient **far stars**, a newcomer
set, then a diversity-ranked near set (`lib/galaxy-sample.ts`), seeded per viewer per
day so reloads don't reshuffle. Edges are only computed among the drawn people.

- `galaxy_pool(target_profile_id uuid, near_size int default 600, fresh_size int default 100, fresh_days int default 14)`
  returns `table (profile_id, display_name, cluster text, similarity float, joined_days_ago int, tags text[], valence float, energy float, source text)`.
  One row per candidate profile: their pick closest to any of the target's picks (the
  same "best pick pair" grouping as `match_picks`, not a profile average). Each of the
  target's picks does its own HNSW-ordered lookup (`LATERAL ... ORDER BY <=> LIMIT`), so
  cost is bounded by `near_size`, not by table size. `source = 'fresh'` rows are recent
  joiners who weren't near anyone. `tags/valence/energy` are the matched pick's, and feed
  only the diversity pass; similarity to you is the pgvector score.
- `galaxy_cluster_counts(target_profile_id uuid)` returns `table (cluster text, people bigint)`,
  everyone but the target. The route subtracts what it drew to get `hidden`.
- **Far stars** reuse `wander_picks` (same song, far apart in feeling) with no Gemini call:
  loading the galaxy never spends LLM calls. Tapping a far star points at Wander.
- **Hop**: `GET /api/galaxy?center=<profileId>` (and `/more?...&center=`) centers the window on another star. The center must already be in the viewer's own window (else 403). Response `meId` is the center; `viewerId` is the real viewer, included as an anchor node. Same public-picks-only RPCs, no LLM, no schema change.
- `GET /api/galaxy/more?cluster=&have=` pages the next 40 people in one cluster ("More
  here"). It ranks at most the pool (600), so a cluster larger than that can't be paged
  to the end. That is deliberate: past a screenful, use Wander or search instead.

**Clusters:** as of migration `20260929000000` the source-of-truth column is
`profiles.primary_topic_cluster_id` (FK -> `topic_clusters`, nullable, treated as
`'unassigned'`) — see `topic_clusters` above. It is a label for grouping, not a matching
vector. `lib/cluster-assign.ts` scores each pick from its mood tags plus valence/energy
(tags lead, the slider breaks ties) and the profile takes the cluster with the highest
total across its picks. No LLM, no embeddings. It is recomputed after every pick and
lazily for the viewer on galaxy load; profiles with no picks stay null. Someone whose
picks straddle two "whys" can move between clusters as they add songs, and the layout
follows. **This description is the target design; the code paths above and the SQL below
still read/write the pre-migration `primary_cluster` text column and need re-wiring (see
the `topic_clusters` table note) before `20260929000000` can be applied to the hosted
project.**
`supabase/migrations/20260927010000_galaxy_window.sql` is applied to the live project and verified (2026-09-26): `wander_picks`, `galaxy_pool` and `galaxy_cluster_counts` return correct rows for the seeded personas.

**Route shapes the frontend reads** (all session-authenticated):
- `GET /api/profile?id=<uuid|me>` -> `{ profile, picks }`. `me` is the signed-in user.
  Each pick is `{ id, song_id, tags, valence, energy, reason_text, is_public, created_at,
  songs: { id, title, artist, album_art_url, spotify_track_id } }`. Other people's private
  picks are filtered out server-side.
- `GET /api/match` -> `{ matches: [{ profileId, displayName, card, similarity, cluster, songs }] }`.
  `similarity` is the best pick pair's cosine score from `match_picks`; `cluster` is the
  candidate's `primary_cluster`; `songs` are their public songs (with `album_art_url`).
  A pair whose card is already cached is **not** re-evaluated by Gemini, so loading
  Connections is cheap after the first time.
- `GET /api/galaxy/songs` -> `{ meId, people, songs }`: the song layer for your galaxy window.
  Each song has `albumArtUrl`, `meaning` (`songs.context_summary`) and `listeners`, where
  every listener carries `why`, the cluster that pick's tags/slider lean toward
  (`pickWhy` in `lib/cluster-assign.ts`). Only public picks of other people are read.
  No Gemini.

## Auth model
Real Supabase Auth — RLS should mirror the standard pattern: profiles are
readable by any authenticated user, writable only by their owner
(`auth.uid() = id` / `auth.uid() = profile_id`); `song_picks` follow the
same owner-write rule with `is_public` gating cross-user reads;
`connection_cards`/`messages` are readable/writable only by their two
participants. Backend route handlers use a session-based Supabase client
(`lib/supabase/serverAuth.ts`) for anything acting "as the current user,"
and the service-role client (`lib/supabase/server.ts`) only for operations
that legitimately span users (catalog lookup/insert, running
`match_picks`, reading/writing `profile_portraits`).

## Open questions for whoever builds the migration
- Exact grouping SQL for `match_picks` (window function vs. `distinct on`
  vs. a lateral join) — functionally it just needs "best pick-pair per
  candidate profile," implementation is an open choice.
- Whether `song_picks.embedding`'s HNSW/ivfflat index needs retuning at
  770 dims vs. `songs.embedding`'s 768 — should be a non-issue, worth a
  quick sanity check.
- `fallback_key` collisions (typos, "feat." variants) still create
  duplicate catalog rows when MusicBrainz also fails to resolve — accepted
  as a hackathon-scale limitation.
