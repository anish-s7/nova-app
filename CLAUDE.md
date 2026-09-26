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
| Auth | Supabase Auth (incl. Spotify OAuth) |
| Messaging | Supabase Realtime |
| LLM + embeddings | Google Gemini API (`gemini-2.5-flash` for text, `gemini-embedding-001` for vectors) |
| Music data | Spotify Web API |
| Hosting | Vercel |

## Directory map
```
app/api/           Route handlers — the only thing frontend calls
lib/supabase/       Server-side Supabase client + typed row shapes
lib/gemini/         All Gemini calls (song context, embeddings, card generation)
lib/matching/       pgvector query + profile embedding aggregation
lib/spotify/        OAuth + track fetch, display/search only
lib/tags.ts         Fixed mood/context tag taxonomy
lib/emotion.ts       Valence/energy constants + clamping
db/contract.md      Source of truth for the DB schema — read this before touching any table
```

## How matching works (current design)
Users don't write essays. Per song they pick, they: tap 1-3 tags from a
fixed list, and drag one point on a circular valence/energy slider
(how positive and how energetic that song makes them feel). Each *unique*
song gets one Gemini-generated context embedding, computed once and shared
by every user who picks it — not regenerated per user. A profile's overall
embedding is the average of their songs' embeddings plus their averaged
valence/energy, and matching is a pgvector nearest-neighbor search over
that. See `db/contract.md` for exact table shapes and the aggregation
formula.

## Hard rule: Spotify data can never touch the LLM
Spotify's Developer Policy prohibits (a) feeding Spotify Content into any
ML/AI model, and (b) analyzing Spotify content for any purpose, including
building user profiles. Practical rule for this codebase:

- Spotify's Web API is used **only** to fetch track title/artist/album art
  for display and to power song search/autocomplete.
- Any Gemini call that touches a song (see `lib/gemini/generateSongContext.ts`)
  may only receive plain `{ title, artist }` strings — never a raw Spotify
  API response object, and never fields like audio features, genres, or
  popularity.
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
  only work for allowlisted testers).

## Getting started
```bash
npm install
cp .env.local.example .env.local   # fill in Supabase + Gemini + Spotify keys
npm run dev
```
