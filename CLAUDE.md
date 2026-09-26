# Song Galaxy — CLAUDE.md

Full product pitch is in `README.md`. This file is for anyone (or any
Claude Code session) writing code in this repo — stack, conventions, and
the rules that must not be broken.

## Team split
- **Backend** (routes, Supabase glue, Gemini pipeline, matching logic)
- **Database** (Supabase schema, migrations, RLS — owns `db/contract.md`
  jointly with backend; backend defines the contract, DB implements it)
- **Floating** (backend/frontend as needed)
- **Frontend** (Galaxy visualization, forms, Connection Card UI)

## This is NOT the Next.js you know
This version of Next.js has breaking changes — APIs, conventions, and file
structure may all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation
notices.

(`next dev` may also generate an `AGENTS.md` containing this same rule —
verify at `node_modules/next/dist/server/lib/generate-agent-files.js`.)

## Tech stack
| Layer | Technology |
|---|---|
| Framework | Next.js (App Router), one repo for frontend + backend |
| Styling | Tailwind CSS |
| Galaxy visualization | react-force-graph |
| Backend | Next.js Route Handlers (`app/api/`) |
| Database | Supabase (Postgres) + pgvector |
| Auth | Supabase Auth (Spotify OAuth optional — top-tracks import only) |
| Messaging | Supabase Realtime |
| LLM + embeddings | Google Gemini API (`gemini-2.5-flash` for text, `gemini-embedding-001` for vectors) |
| Song identity | MusicBrainz API — no auth, resolves free-text title+artist to canonical form |
| Song features | Hugging Face mirror of `maharshipandya/spotify-tracks-dataset` — static, seeded once |
| Lyric recovery | Kaggle "40k songs with audio features and lyrics" — static, low-confidence fallback only |
| Music data (optional) | Spotify Web API — OAuth top-tracks import only; never used for search |
| Hosting | Vercel |

## Directory map
```
app/api/           Route handlers — the only thing frontend calls
lib/supabase/       Server-side Supabase client + typed row shapes
lib/gemini/         All Gemini calls (song context, embeddings, card generation, catalog fallback tagging)
lib/matching/       pgvector query + per-pick candidate retrieval + LLM evidence check
lib/musicbrainz/     Song search/lookup — resolves free-text title+artist into canonical { title, artist, mbid }
lib/catalog/         Static datasets — feature seed script, pg_trgm match, lyric full-text recovery
lib/spotify/        OAuth + top-tracks import only (optional; no search — see lib/musicbrainz/)
lib/tags.ts         Fixed mood/context tag taxonomy
lib/emotion.ts       Valence/energy constants + clamping
db/contract.md      Source of truth for the DB schema — read this before touching any table
```

## How matching works (current design)
Users don't write essays. Per song they pick, they: tap 1-3 tags from a
fixed list, and drag one point on a circular valence/energy slider
(how positive and how energetic that song makes them feel). Each
*individual pick* — one user's tags and slider position for one song —
gets its own Gemini-generated context embedding, since the same song can
carry a different tag/slider combination per person; a song is never
reduced to one shared embedding across everyone who picked it. Matching
is a pgvector nearest-neighbor search over individual picks, not an
average of a whole profile, so one strong overlap between two specific
picks is enough to surface a candidate rather than getting diluted by
someone's other, unrelated songs. Candidates above a similarity floor go
through an LLM evidence check before being shown: it must identify the
specific shared thread, cite both sides' actual data, note a real
difference, and return "insufficient evidence" when the overlap doesn't
hold up — a candidate that fails this check is dropped, not shown as a
weak match. See `db/contract.md` for exact table shapes — a `song_picks`
table (one row per user per song) replaces any design that stores a
single averaged profile-level vector.

## Song data pipeline (identity + features)
Resolving a song (manual entry or Spotify import) into something
matchable runs through a fallback chain, in order:

- **MusicBrainz** resolves whatever text came in into a canonical
  `{ title, artist, mbid }` with a confidence score. No auth, but respect
  the 1 req/sec rate limit — batch-resolve with a delay, don't call it
  per keystroke.
- **Static dataset match** fuzzy-matches that canonical pair against
  `song_catalog` (seeded from the Hugging Face dataset above) using
  Postgres `pg_trgm` trigram similarity on `artist || ' ' || title`, not
  exact string equality, to pull real audio features Spotify no longer
  serves live.
- **Lyric-based recovery** kicks in only if MusicBrainz's score is under
  80 — the input may be a remembered lyric rather than a title. Full-text
  search against `lyrics_corpus.lyrics` (seeded from the Kaggle lyrics
  dataset above); a strong hit gets re-resolved through MusicBrainz as
  normal, rather than skipping identity resolution.
- **LLM fallback** only fires if all three above fail — a song too new,
  too obscure, or too garbled to resolve any other way. Gemini gets the
  plain `{ title, artist }` strings and guesses `{ genre, mood, energy }`,
  stored with `source: 'llm_guess'` so nothing downstream needs to know
  which source a row came from.

Song identification itself is never done via the LLM — it's a retrieval
problem, solved by MusicBrainz and the lyric corpus. An LLM guessing exact
song identity from a fragment is prone to confidently wrong answers, which
would poison identity for everything downstream; the LLM only ever
guesses approximate tags once identity is already resolved, or runs the
evidence check described above. `song_catalog` is the taste/audio-feature
signal, separate from `song_picks` (the meaning signal) — see
`db/contract.md` for how the two combine.

## Hard rule: Spotify data can never touch the LLM
Spotify's Developer Policy prohibits (a) feeding Spotify Content into any
ML/AI model, and (b) analyzing Spotify content for any purpose, including
building user profiles. Practical rule for this codebase:

- Spotify's Web API is used **only** to fetch track title/artist/album art
  for display and to power the optional top-tracks import.
- Any Gemini call that touches a song (see `lib/gemini/generateSongContext.ts`)
  may only receive plain `{ title, artist }` strings — never a raw Spotify
  API response object, and never fields like audio features, genres, or
  popularity.
- If you're adding a new Gemini call near anything Spotify-related, check
  this rule first. When in doubt, don't pass the Spotify payload in — pass
  the plain strings you already extracted from it.
- MusicBrainz and the static Hugging Face/lyric datasets are not Spotify
  data and carry no such restriction — the LLM fallback above may use
  them freely. The only thing that must never reach Gemini is a raw
  Spotify API response, or any field derived from one.

## Working conventions
- `db/contract.md` is the schema source of truth. Any PR that changes what
  columns/tables backend reads or writes must update this file in the same
  PR — don't let it drift from the real Supabase schema.
- LLM calls run synchronously inside route handlers (no queue/background
  worker) — this is a hackathon-scale decision, not a scalability one.
- Connection Cards are cached in `connection_cards` — never regenerate one
  that already exists for a user pair.
- Manual song entry resolves via MusicBrainz by default and must always
  work without Spotify (dev-mode Spotify apps only work for allowlisted
  testers, and top-tracks import is optional besides).
- Matching never averages a single strong connection away into a
  profile-level blob — see "How matching works" above. If you find
  yourself computing one embedding per user instead of per pick, stop and
  re-read that section.

## Getting started
```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + Gemini keys (Spotify optional — only needed for top-tracks import)
npm run dev
```
