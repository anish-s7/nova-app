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
| LLM | Google Gemini API (`gemini-2.5-flash` for text, `gemini-embedding-001` for vectors) |
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
- **MusicBrainz `User-Agent` is a placeholder.** `lib/musicbrainz/client.ts`
  ships with a fake contact email in its `User-Agent` header. MusicBrainz
  requires a real, descriptive one and may rate-limit or block requests
  with a generic/fake one — **replace it before the demo.**
- **The real Supabase migration hasn't been applied yet.** `db/contract.md`
  is the target schema; no live database matches it yet, so none of this
  has been tested end-to-end against a real Supabase project.
- Implemented: auth (`lib/supabase/serverAuth.ts`, session-derived
  `profileId` in `profile`/`messages`/`cards`/`picks` routes), the
  MusicBrainz-primary identity resolution in `app/api/picks/route.ts`, and
  the evidence-check step (`lib/gemini/evaluateAndGenerateCard.ts`) — both
  `lib/matching/findMatches.ts` (pgvector retrieval path) and
  `app/api/cards/[matchId]/route.ts` (direct-pair path) now call it and
  only ever return/cache a `"match"` result, dropping
  `"insufficient_evidence"` candidates.

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
cp .env.local.example .env.local   # fill in Supabase + Gemini keys (Spotify optional)
npm run dev
```
