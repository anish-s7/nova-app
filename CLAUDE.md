# Song Galaxy — CLAUDE.md

Full product pitch is in `README.md`. This file is for anyone (or any
Claude Code session) writing code in this repo — stack, conventions, and
the rules that must not be broken.

**This file is only edited when explicitly asked for.** Don't rewrite it
as a side effect of an unrelated architecture or code change — update
`db/contract.md` and the code instead, and leave this file alone unless
someone specifically asks for a CLAUDE.md update.

## Team split
- **Backend** (routes, Supabase glue, Gemini/MusicBrainz pipeline, matching logic)
- **Database** (Supabase schema, migrations, RLS — owns `db/contract.md`
  jointly with backend; backend defines the contract, DB implements it)
- **Floating** (backend/frontend as needed)
- **Frontend** (Galaxy visualization, forms, Connection Card UI)

## Tech stack
| Layer | Technology |
|---|---|
| Framework | Next.js (App Router), one repo for frontend + backend |
| Styling | Tailwind CSS |
| Galaxy visualization | react-three-fiber (three.js) + d3-force-3d layout, SVG fallback |
| UI components / motion | shadcn/ui (Base UI), lucide-react, anime.js |
| Backend | Next.js Route Handlers (`app/api/`) |
| Database | Supabase (Postgres) + pgvector |
| Auth | Supabase Auth (real sessions — see "Auth" below), incl. optional Spotify OAuth |
| Messaging | Supabase Realtime |
| LLM | Google Gemini API (`gemini-flash-lite-latest` for text, `gemini-embedding-001` for vectors) |
| Song identity | MusicBrainz API (primary), Gemini (fallback only) — see below |
| Music data (optional) | Spotify Web API — OAuth top-tracks import only, display purposes only |
| Hosting | Vercel |

## Directory map
```
app/api/           Route handlers — the only thing frontend calls
app/(tabs)/, app/onboarding/  Frontend screens (galaxy, connections, messages, profile, onboarding flow)
components/        UI components; components/galaxy/ holds the 3D scene + SVG fallback
lib/api.ts         The frontend's single data-access seam (still mock-backed — see MERGE_CHECKLIST.md)
lib/supabase/       Server-side Supabase clients (service-role + session-based) + typed row shapes
lib/musicbrainz/     Song identity resolution (title/artist -> canonical mbid)
lib/gemini/         Song mood fallback, embeddings, evidence-check + card generation
lib/matching/       pgvector query over per-pick embeddings
lib/spotify/        Optional OAuth + track fetch, display only — never used for identity/search
lib/sim/            Client-side live simulation behind /sim (engine, learner, real song embeddings)
scripts/            One-off scripts (build-sim-embeddings.ts)
lib/tags.ts         Fixed mood/context tag taxonomy
lib/emotion.ts       Valence/energy constants + clamping
db/contract.md      Source of truth for the DB schema — read this before touching any table
```

## How matching works (current design)
Users don't write essays. Per song they pick, they: tap 1-3 tags from a
fixed list, and drag one point on a circular valence/energy slider (how
positive and how energetic that song makes them feel).

**Song identity**, before anything else: a typed title/artist is resolved
via MusicBrainz into a canonical `{title, artist, mbid}`. If MusicBrainz
can't confidently resolve it, Gemini is used as a fallback to guess
identity/mood directly from the typed text. Either way, once a song is
identified, it gets one shared mood/context embedding (from Gemini,
`{title, artist}` only), generated once per unique song and reused by
every user who picks it.

**Matching is per-pick, not per-profile.** Each individual pick (one user
+ one song + their tags + their valence/energy) gets its own vector: the
song's shared embedding plus that pick's tags/valence/energy appended.
Nothing is averaged into a single profile-level vector — averaging would
bury a strong specific match (e.g. one shared grief song) under someone's
unrelated other picks. A candidate match is found via a pgvector
nearest-neighbor search over picks, grouped by candidate profile.

**AI does real judgment, not just narration.** Candidates that pgvector
retrieves aren't shown as-is. Gemini reviews the two actual picks and
either (a) confirms a specific, citable shared thread and returns the full
Connection Card, or (b) returns "insufficient evidence," and that
candidate is dropped rather than shown. This makes the AI an actual filter
in the pipeline, not just a narrator of whatever the math found.

See `db/contract.md` for exact table shapes (`songs`, `song_picks`, the
`match_picks` RPC).

## Auth
Route handlers derive the acting user from the real Supabase session
(`auth.uid()`), not a trusted `profileId` param. Use the session-based
Supabase client for anything acting "as the current user" (creating a
profile, adding a pick, sending a message); the service-role client is
only for backend-only operations that legitimately span users (catalog
lookups, the match RPC).

Sign-in (email/password, Google, Apple) is Supabase Auth end to end — see
`AUTH_SETUP.md` for dashboard setup and a file map. `proxy.ts` (Next 16's
name for middleware) refreshes the session cookie and redirects signed-out
visitors from app screens to `/login`. When the `NEXT_PUBLIC_SUPABASE_*` keys
are absent, the proxy and auth UI step aside and the app runs on demo data.

## Hard rule: Spotify data can never touch the LLM
Spotify's Developer Policy prohibits (a) feeding Spotify Content into any
ML/AI model, and (b) analyzing Spotify content for any purpose, including
building user profiles. Practical rule for this codebase:

- Spotify's Web API is used **only** to fetch track title/artist/album art
  for display and to power the optional top-tracks import.
- Any Gemini call that touches a song may only receive plain
  `{ title, artist }` strings — never a raw Spotify API response object,
  and never fields like audio features, genres, or popularity.
- MusicBrainz is not Spotify data and carries no such restriction.
- If you're adding a new Gemini call near anything Spotify-related, check
  this rule first. When in doubt, don't pass the Spotify payload in — pass
  the plain strings you already extracted from it.

## Working conventions
- `db/contract.md` is the schema source of truth. Any PR that changes what
  columns/tables backend reads or writes must update this file in the same
  PR — don't let it drift from the real Supabase schema.
- LLM calls run synchronously inside route handlers (no queue/background
  worker) — this is a hackathon-scale decision, not a scalability one.
- Connection Cards are cached in `connection_cards` — never regenerate one
  that already exists for a user pair.
- Manual song entry must always work without Spotify (dev-mode Spotify apps
  only work for allowlisted testers, and Spotify import is optional besides).
- MusicBrainz's search API is rate-limited to 1 request/second — never call
  it per keystroke; resolve on submit, not on every input change.

## Implementation status / open TODOs
- **The v2 schema is live and seeded with real data** (as of 2026-09-26).
  `supabase/migrations/*.sql` has been applied to the real project, and
  `scripts/seed-real-data.ts` has run successfully end to end — 7 real
  profiles, 26 real catalog songs (resolved via real MusicBrainz + Gemini,
  not fabricated vectors), 26 real picks. This is the first real
  confirmation the backend actually works, not just that it typechecks.
- Implemented: auth (`lib/supabase/serverAuth.ts`, session-derived
  `profileId` in `profile`/`messages`/`cards`/`picks`/`match` routes), the
  MusicBrainz-primary identity resolution in `app/api/picks/route.ts`, and
  the evidence-check step (`lib/gemini/evaluateAndGenerateCard.ts`) — both
  `lib/matching/findMatches.ts` (pgvector retrieval path) and
  `app/api/cards/[matchId]/route.ts` (direct-pair path) now call it and
  only ever return/cache a `"match"` result, dropping
  `"insufficient_evidence"` candidates.
- **Frontend is still not wired to any of this.** `lib/api.ts`'s
  `const db: Db = mockDb` hasn't been flipped yet — see
  `MERGE_CHECKLIST.md`. The two real blockers there (no auth session in the
  app, and onboarding not collecting tags/valence/energy) are unrelated to
  and unaffected by the backend now being proven to work.

## Known gotchas (found seeding real data on 2026-09-26 — read before touching Gemini/vector code)
- **Gemini model names go stale fast.** `gemini-2.5-flash` was retired for
  new callers mid-hackathon (live 404 from the real API). Always use a
  `-latest` alias (`gemini-flash-latest`, `gemini-flash-lite-latest`), never
  a pinned dated/versioned model name, in `lib/gemini/client.ts`.
- **`gemini-embedding-001` defaults to 3072 dimensions, not 768.** Every
  doc/schema in this repo assumed 768 without ever verifying it against a
  live call. `lib/gemini/generateSongContext.ts` now requests 768
  explicitly via `config: { outputDimensionality: EMBEDDING_DIMENSIONS }`.
  If you ever change `EMBEDDING_DIMENSIONS` in `lib/gemini/client.ts`, the
  `vector(768)`/`vector(770)` column widths in the migration have to change
  too — they're not derived from each other.
- **Postgres returns `vector` columns as a string, not a parsed array.**
  `song.embedding` from any `.select()` comes back as `"[0.1,0.2,...]"`
  (text), even though `.insert({ embedding: [...] })` correctly accepts a
  real `number[]`. Spreading a read-back embedding directly (`[...song
  .embedding, ...]`) silently corrupts it into one entry per character.
  Always run a read-back embedding through `parseVector()` in
  `lib/supabase/vector.ts` before doing array math on it.
- **MusicBrainz's contact email lives in `MUSICBRAINZ_CONTACT_EMAIL`
  (env var), not a source literal** — this repo is public, and a
  placeholder/fake email in the `User-Agent` got connections reset
  mid-run (likely their abuse detection). Use a throwaway/alias address,
  not a personal one, since it's a real address MusicBrainz could contact.

## Demo simulation (`/sim`)
A client-side, randomized live simulation exists so the product can be demoed without real users:
people join and leave, songs go viral, clusters form in the Galaxy, and a matcher visibly "learns".
It is a demo, not the production system, and it is labelled "Simulated" on screen.
- **Isolated.** `app/sim/` + `lib/sim/` run entirely in the browser: no Supabase, no auth, no runtime
  Gemini calls. Each run is grown from a fresh random seed (`/sim?s=<scenario>&seed=<n>` replays one).
- **Real embeddings, synthetic people.** Songs are the mock catalog (`lib/music-context.ts`); their
  vectors are real `gemini-embedding-001` output, baked into `lib/sim/song-vectors.json` by
  `npx tsx --env-file=.env.local scripts/build-sim-embeddings.ts` (plain `"title" by artist`
  strings only, so the Spotify rule holds). Re-run it if the catalog changes.
- **Matching is per pick**, as in production: best pick pair, judged on song content, mood
  (valence/energy), shared tags and taste group. Nothing is averaged into a profile.
- **In-run learning is simulated.** The learner tunes weights against a hidden, randomly drawn
  "what makes a match click" rule. It shows the idea of outcome-based tuning and says nothing about
  how the production matcher would perform. It is not the "Continuous learning" item under Future
  work, which remains unbuilt: nothing in the real system logs outcomes or tunes from them.

## Future work (not implemented)
- **Continuous learning / outcome-based tuning.** Right now nothing in this
  system learns from outcomes — Gemini calls are stateless. A future
  version could log match outcomes (was a card shown, was a first message
  actually sent) and use that data to tune `EMOTION_WEIGHT` or matching
  thresholds over time. This is explicitly out of scope for now — don't
  build logging or tuning infrastructure for this unless asked.

## Getting started
```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + Gemini + MusicBrainz contact email (Spotify optional)
npm run dev
```

To seed real demo data (a handful of `lib/mock-world.ts` personas run
through the real MusicBrainz + Gemini pipeline, not fabricated vectors):
```bash
node --env-file=.env.local node_modules/.bin/tsx scripts/seed-real-data.ts
```
