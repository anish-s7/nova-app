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
| card_json | jsonb | shape: `{ shared_why, evidence: { user_a, user_b }, difference, openers[], suggested_swap_prompt }` |
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
