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

### `profiles`
| column | type | notes |
|---|---|---|
| id | uuid, PK | = `auth.users.id` |
| display_name | text | |
| primary_cluster | text, nullable | one of `lib/clusters.ts` CLUSTER_IDS; read by `galaxy_pool`. Written by `lib/matching/refreshPrimaryCluster.ts` (rule in `lib/cluster-assign.ts`): after every `POST /api/picks`, and lazily for the viewer when the galaxy loads. Null until someone has a pick |
| created_at | timestamptz | default now() |

No `embedding` column — matching lives entirely on `song_picks` now.

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
| embedding | vector(770), not null | **computed once at insert time**, never recomputed later: the song's 768-dim `songs.embedding` with this pick's `valence`/`energy` (scaled by `EMOTION_WEIGHT`, see `lib/emotion.ts`) appended as 2 more dims |
| reason_text | text, nullable | optional bonus free text, never required by the UI |
| is_public | boolean | default true — privacy control, hide from matching/cards shown to others |
| created_at | timestamptz | default now() |

Unlike v1, there is no aggregation step anywhere — `song_picks.embedding`
is final the moment the row is inserted.

### `connection_cards`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| user_a | uuid, FK -> profiles.id | store the smaller of the two ids here (unordered pair convention) |
| user_b | uuid, FK -> profiles.id | store the larger of the two ids here |
| card_json | jsonb | shape: `{ shared_why, evidence: { user_a, user_b }, difference, openers[], suggested_swap_prompt, kind?, shared_song? }`. `kind` is `"match"` when absent. `"contrast"` cards come from Wander (see below): `shared_why` is the one song both picked, `evidence` is how each person feels it, `difference` is the gap, and `shared_song` is `{ title, artist }` from our own `songs` row. |
| created_at | timestamptz | |

Unique constraint on `(user_a, user_b)`. Only rows where the evidence-check
(see CLAUDE.md) actually confirmed a match get inserted — an
"insufficient evidence" result is never cached here.

### `messages`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| user_a | uuid | unordered pair, same convention as `connection_cards` |
| user_b | uuid | |
| sender_id | uuid, FK -> profiles.id | |
| body | text | |
| created_at | timestamptz | Supabase Realtime subscribes to this table directly |

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
`song_pick_id`/`target_pick_id` pair is what gets passed into the
evidence-check step (`lib/gemini/evaluateAndGenerateCard.ts`) — the
backend never shows a raw similarity score to the user, only the result of
that check.

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
- `GET /api/galaxy/more?cluster=&have=` pages the next 40 people in one cluster ("More
  here"). It ranks at most the pool (600), so a cluster larger than that can't be paged
  to the end. That is deliberate: past a screenful, use Wander or search instead.

**Clusters:** `profiles.primary_cluster` (one of `lib/clusters.ts` CLUSTER_IDS; nullable,
treated as `'unassigned'`). It is a label for grouping, not a matching vector.
`lib/cluster-assign.ts` scores each pick from its mood tags plus valence/energy (tags lead,
the slider breaks ties) and the profile takes the cluster with the highest total across its
picks. No LLM, no embeddings. It is recomputed after every pick and lazily for the viewer on
galaxy load; profiles with no picks stay null. Someone whose picks straddle two "whys" can
move between clusters as they add songs, and the layout follows.
`supabase/migrations/20260927010000_galaxy_window.sql` is untested against a live database, like the rest of the schema.

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
`match_picks`).

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
