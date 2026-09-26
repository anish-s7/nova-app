# Backend ⇄ Database Contract

This is the schema the backend route handlers assume exists in Supabase.
It's the interface, not the migration — @db-teammate owns writing and
applying the actual SQL (including RLS policies, indexes, and the pgvector
extension). If a column name or type changes, update this file in the same
PR so backend and DB never drift silently.

## Extensions
- `vector` (pgvector) must be enabled.

## Tables

### `profiles`
| column | type | notes |
|---|---|---|
| id | uuid, PK | = `auth.users.id` |
| display_name | text | |
| created_at | timestamptz | default now() |

### `songs`
| column | type | notes |
|---|---|---|
| id | uuid, PK | default gen_random_uuid() |
| profile_id | uuid, FK -> profiles.id | |
| title | text | |
| artist | text | |
| spotify_track_id | text, nullable | null for manually-entered songs |
| reason_text | text | user's free-text "why" |
| is_public | boolean | default true — privacy control, hide reason from cards shown to others |
| created_at | timestamptz | default now() |

### `motivations`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| song_id | uuid, FK -> songs.id | |
| label | text | e.g. "company during loneliness" — Gemini output |
| embedding | vector(768) | Gemini embedding output is fixed at 768 dimensions |
| created_at | timestamptz | |

### `connection_cards`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| user_a | uuid, FK -> profiles.id | store the smaller of the two ids here to keep the pair unordered/unique |
| user_b | uuid, FK -> profiles.id | store the larger of the two ids here |
| card_json | jsonb | shape: `{ shared_why, evidence: { user_a, user_b }, difference, openers[], suggested_swap_prompt }` |
| created_at | timestamptz | |

Unique constraint on `(user_a, user_b)` for the cache lookup.

### `messages`
| column | type | notes |
|---|---|---|
| id | uuid, PK | |
| user_a | uuid | the two participants, same unordered convention as above, OR a separate `connections` table if we want a real connection id — open question, default to unordered pair for now |
| user_b | uuid | |
| sender_id | uuid, FK -> profiles.id | |
| body | text | |
| created_at | timestamptz | Supabase Realtime subscribes to this table directly |

## RPCs

### `match_profiles(target_profile_id uuid, match_count int default 10)`
Returns `table (profile_id uuid, display_name text, similarity float)` —
nearest-neighbor search over `motivations.embedding`, using the best cosine
similarity between any target/candidate motivation pair and excluding
`target_profile_id` itself. Target motivations may come from any of the target
user's songs; candidate motivations only come from public songs.
Used by `lib/matching/findMatches.ts`.

## Open questions for @db-teammate
- Precompute matches into a `connections` table, or always query pgvector
  live at read time in `/api/match`? Backend plan assumes **live query**
  (simpler, no extra table) unless matching gets too slow to demo.
- Embedding dimension is fixed at 768. The embedding caller must request or
  return exactly that many values.
- `motivations.embedding` uses an HNSW cosine-similarity index.
