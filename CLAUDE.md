# Song Galaxy — CLAUDE.md

Full product pitch is in `README.md`. This file is for anyone (or any
Claude Code session) writing code in this repo — stack, conventions, and
the rules that must not be broken.

**This file is only edited when explicitly asked for.** Don't rewrite it
as a side effect of an unrelated architecture or code change — update
`db/contract.md` and the code instead, and leave this file alone unless
someone specifically asks for a CLAUDE.md update.

Last full update: 2026-09-26, after merging `galaxy-clusters` into `main` (`f39b861`).

## Team split
- **Anish** — backend (routes, Supabase glue, Gemini/MusicBrainz pipeline, matching) and, since
  2026-09-26, the database (schema, migrations, RLS, `db/contract.md`).
- **James** — frontend (onboarding, auth UI / `login-signup`, screens).
- **Daniel** — galaxy frontend (clusters, galaxy window, wander UI) and the `/sim` demo.
- **Bao** — floating backend/frontend (Gemini testing, early schema work).

## Tech stack
| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), one repo for frontend + backend. **Not the Next.js in your training data** — see `AGENTS.md` and `node_modules/next/dist/docs/` |
| Styling | Tailwind CSS |
| Galaxy visualization | react-three-fiber (three.js) + d3-force-3d layout, SVG fallback |
| UI components / motion | shadcn/ui (Base UI), lucide-react, anime.js |
| Backend | Next.js Route Handlers (`app/api/`) |
| Database | Supabase (Postgres) + pgvector |
| Auth | Supabase Auth (cookie sessions via `@supabase/ssr`), email/password live; Google/Apple scaffolded but disabled |
| Messaging | Supabase `messages` table (Realtime publication enabled; client reads not wired yet) |
| LLM | Google Gemini API (`gemini-flash-lite-latest` for text, `gemini-embedding-001` at 768 dims for vectors) |
| Song identity | MusicBrainz API (primary), Gemini (fallback only) — see below |
| Music data (optional) | Spotify Web API — OAuth top-tracks import only, display purposes only |
| Package manager | **npm only** (`package-lock.json`). Never commit `pnpm-lock.yaml` / `pnpm-workspace.yaml` |
| Hosting | Vercel (not deployed yet) |

## Directory map
```
app/api/                     Route handlers — the only thing the frontend calls
  picks/                     POST: resolve song (MusicBrainz → Gemini), insert song_pick, refresh cluster
  match/                     GET: pgvector candidates → AI evidence-check → confirmed matches with cards
  cards/[matchId]/           GET cached card / POST generate one for a specific pair
  profile/                   GET profile + picks (private picks only for the owner) / POST display name
  messages/                  POST send (GET read route is planned, not built)
  galaxy/, galaxy/more/      GET bounded galaxy window / page one cluster
  wander/                    POST "same song, different feeling" contrast cards
  spotify/                   Optional OAuth top-tracks import
app/auth/callback/           Supabase OAuth / email-confirmation landing (exchanges code for session)
app/login/, app/signup/      Auth screens (components/auth/auth-form.tsx)
app/(tabs)/, app/onboarding/ Frontend screens (galaxy, connections, messages, people, me; onboarding flow)
app/sim/, lib/sim/           /sim demo ONLY — see "Demo simulation" below; never import from app code
components/                  UI components; components/galaxy/ holds the 3D scene + SVG fallback
proxy.ts                     Next 16's middleware: refreshes the session cookie, gates app screens
lib/api.ts                   The frontend's single data-access seam. Still mock-backed (see status)
lib/mock-db.ts               Mock implementation of the v2 Db contract (lib/types.ts)
lib/mock-world.ts            Mock people/songs used by mock-db and "NOT IN CONTRACT" enrichment
lib/types.ts                 View types (UI) + "DB contract rows" (v2) + the Db interface
lib/galaxy-adapter.ts        Maps GET /api/galaxy responses to the galaxy view types
lib/supabase/                server.ts (service role), serverAuth.ts (session), browser.ts (client),
                             proxy.ts (session refresh), config.ts (keys present?), vector.ts (parseVector)
lib/musicbrainz/             Song identity resolution (title/artist → canonical mbid)
lib/gemini/                  Song context + embedding, evidence-check/match cards, contrast cards
lib/matching/                findMatches (match_picks), findWander (wander_picks), galaxyWindow,
                             refreshPrimaryCluster, alignCardEvidence, cosineSimilarity
lib/cluster-assign.ts        Tags + valence/energy → one of five clusters (no LLM, no embeddings)
lib/clusters.ts              The five cluster ids/labels/colors (CLUSTER_IDS)
lib/tags.ts                  Fixed mood/context tag taxonomy (10 tags)
lib/emotion.ts               EMOTION_WEIGHT + clampEmotionValue
lib/safe-next.ts             safeNextPath(): the only allowed way to use an untrusted ?next= value
supabase/migrations/         The real schema, applied in order via the SQL Editor (see status)
supabase/seed.sql            Old fabricated-vector seed; superseded by scripts/seed-real-data.ts
scripts/seed-real-data.ts    Seeds demo personas through the real MusicBrainz + Gemini pipeline
scripts/test-gemini.ts       Standalone Gemini smoke test (no DB writes)
scripts/build-sim-embeddings.ts  Regenerates lib/sim/song-vectors.json for /sim
db/contract.md               Schema source of truth — read before touching any table or RPC
MERGE_CHECKLIST.md           How the frontend gets wired to the real backend, method by method
AUTH_SETUP.md                Supabase Auth dashboard setup + auth file map
```

## How matching works (current design)
Users don't write essays. Per song they pick, they: tap 1-3 tags from a
fixed list (`lib/tags.ts`), and drag one point on a circular valence/energy
control (how positive and how energetic that song makes them feel).

**Song identity**, before anything else: a typed title/artist is resolved
via MusicBrainz into a canonical `{title, artist, mbid}`. If MusicBrainz
can't confidently resolve it (or is down), Gemini is used as a fallback.
Either way, once a song is identified it gets one shared mood/context
embedding (from Gemini, `{title, artist}` only), generated once per unique
song and reused by every user who picks it.

**Matching is per-pick, not per-profile.** Each pick (one user + one song +
their tags + their valence/energy) gets its own 770-dim vector: the song's
768-dim embedding plus that pick's valence/energy (×`EMOTION_WEIGHT`)
appended. Nothing is averaged into a profile-level vector — averaging would
bury a strong specific match (e.g. one shared grief song) under someone's
unrelated other picks. `match_picks` finds the best pick pair per candidate
profile.

**AI does real judgment, not just narration.** Candidates aren't shown as-is.
Gemini reviews the two actual picks and either confirms a specific, citable
shared thread (returning the full Connection Card) or returns "insufficient
evidence" and the candidate is dropped. `GET /api/match` only ever returns
confirmed matches, each with its card attached.

**Clusters** (`profiles.primary_cluster`) are a grouping label for the galaxy,
not a matching signal: `lib/cluster-assign.ts` votes across a profile's picks
(tags lead, the slider breaks ties). Recomputed after every pick and lazily on
galaxy load, via the **service-role** client.

**Wander** is the opposite question from matching: same song, far apart in
feeling (`wander_picks`: equal `song_id`, `(valence, energy)` distance ≥ 0.9).
Only on an explicit tap; Gemini writes a `kind: "contrast"` card or drops it.

**Galaxy window**: the front page draws a bounded neighborhood (you, top
matches, far stars, newcomers, a diversity-ranked near set), never everyone.
`galaxy_pool` / `galaxy_cluster_counts` feed it; loading it spends no LLM calls.

See `db/contract.md` for exact table shapes and every RPC.

## Auth
- Route handlers derive the acting user from the real Supabase session
  (`getCurrentProfileId()` in `lib/supabase/serverAuth.ts`), never from a
  `profileId` in the body or query string.
- Session client for anything acting "as the current user"; service-role
  client (`lib/supabase/server.ts`) only for backend operations that span
  users or write derived data: catalog lookups/inserts, the match/wander/galaxy
  RPCs, and `refreshPrimaryCluster` (the `authenticated` role may only update
  `profiles.display_name`, so a session-client write there is silently denied).
- Sign-in is Supabase Auth end to end (`AUTH_SETUP.md`). `proxy.ts` refreshes
  the session cookie and redirects signed-out visitors from app screens to
  `/login`. With no `NEXT_PUBLIC_SUPABASE_*` keys, the proxy and auth UI step
  aside and the app runs on demo data (note: this fails *open* — see backburner).
- **Any `?next=` redirect target goes through `safeNextPath()`** (`lib/safe-next.ts`).
  `"/\evil.com"` passes a naive `startsWith("/") && !startsWith("//")` check and
  resolves to `http://evil.com/` (browsers treat `\` as `/`). Found and fixed 2026-09-26.

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
  this rule first. When in doubt, pass only the plain strings.

## Working conventions
- `db/contract.md` is the schema source of truth. Any change to what
  columns/tables/RPCs the backend uses updates it in the same commit.
- **Schema changes are migrations in `supabase/migrations/`**, never loose SQL
  in `db/`. Follow the existing pattern: `begin; ... commit;`, schema-qualify
  as `public.`, SQL functions get `security invoker` and
  `set search_path = public, extensions` (pgvector's `vector` type and `<=>`
  operator live in `extensions`), and every function gets
  `revoke all ... from public; grant execute ... to authenticated, service_role;`.
  Migrations are applied by hand in the Supabase SQL Editor, in filename order.
- Merging a teammate's branch: do it on a side branch, check with
  `git merge-tree --write-tree origin/main <branch>` first, and compare with a
  **three-dot** diff (`origin/main...branch`). A two-dot diff makes anything
  `main` gained after the branch point look like the branch deleted it. Only
  merge into `main` after `npx tsc --noEmit` and `npx next build` pass.
- Before stepping away from a good state, push a backup branch
  (e.g. `backup-main-20260926`).
- LLM calls run synchronously inside route handlers (no queue) — a
  hackathon-scale decision, not a scalability one.
- Connection Cards are cached in `connection_cards` — never regenerate one
  that already exists for a pair (either kind).
- Manual song entry must always work without Spotify.
- MusicBrainz is rate-limited to 1 request/second — resolve on submit, never
  per keystroke, and insert multiple picks **sequentially**.
- Don't swallow errors with an empty `catch {}`; log them. Two silent
  failures this week were only found by reading code.
- `/sim` is out of scope for app work (see below).

## Implementation status (2026-09-26)

### Live database (hosted Supabase project)
- Applied, in order: `20260926010000_song_galaxy_schema.sql`,
  `20260926020000_grant_service_role_backend_privileges.sql`,
  `20260927000000_profile_name_from_oauth.sql` (signup no longer fails on names
  over 80 chars), `20260927010000_galaxy_window.sql` (`primary_cluster`,
  `wander_picks`, `galaxy_pool`, `galaxy_cluster_counts`).
- Seeded by `scripts/seed-real-data.ts`: Maya, Theo, Jordan, Amara, Noor, Sam
  (password `song-galaxy-demo`), 27 picks resolved through real MusicBrainz +
  Gemini, including a deliberate wander pair (Sam and Noor both picked
  "Landslide", opposite feelings). Every persona has a `primary_cluster`.
  Daniel also has a real account with no picks (shows as `unassigned`).
- **Pending cleanup**: a MusicBrainz-throttled re-run of the seed created 3
  duplicate picks and 3 duplicate catalog rows (song_picks
  `d9a85944-96a0-44b1-82eb-2220829b1424`, `e453b0b1-2fcb-4a82-8a8f-39550b1b2433`,
  `96a09780-518c-480b-9469-3446ededc9d0`; songs
  `7280930f-676d-4bb7-b3fb-2afccb708346`, `886bd9a8-2e0f-4658-a165-358379c7264a`,
  `7859b6a8-49b1-49ee-bd20-ead9ae2c56dc`). Delete them in the SQL Editor
  (service role has no DELETE grant), then re-run the seed once to recompute
  clusters. The seed script is now idempotent (loose title match per persona).
- **Pending dashboard step**: Authentication → URL Configuration → add
  `http://localhost:3000/auth/callback` to Redirect URLs (Vercel URL later).

### Backend
Every route above is implemented against the v2 schema with session auth.
Verified end to end on 2026-09-26 against the live DB, signed in through the
real `@supabase/ssr` cookie flow: `GET /api/match` (4 AI-confirmed matches for
Maya, each with a Gemini-written card), `GET /api/cards/:id` (cache hit),
`POST /api/wander` (Sam → Noor on "Landslide", `kind: "contrast"`),
`GET /api/galaxy` (bounded window + hidden counts), `POST /api/messages` (row
written), `GET /api/profile`; signed-out calls return 401. RPCs `wander_picks`,
`galaxy_pool`, `galaxy_cluster_counts` return correct rows; signup with a
120-char name is truncated to 80 instead of failing.

**Matching-quality issue found during verification (needs a decision):** in
every pick vector the 768-dim song embedding has a norm of ~0.59 (truncated
Gemini embeddings are not unit length) while the two emotion dims
(valence/energy × `EMOTION_WEIGHT` = 5) have a norm of ~3.16. Cosine
similarity is therefore ~95% driven by the slider position and barely by the
song's meaning: picks with the same slider position score ~0.99 regardless of
song, and opposite positions score ~-0.95. Likely fix: L2-normalize the song
embedding before appending, lower `EMOTION_WEIGHT` so the emotion part is a
deliberate minority share (e.g. ~0.3–0.4), then recompute every
`song_picks.embedding` (re-seed; nothing real depends on the old vectors yet).
`/sim` also reads `EMOTION_WEIGHT`, so its numbers shift too.

### Frontend
- Real auth works (signup/login/callback/proxy), but **all app data is still
  mock**: `lib/api.ts` uses `mockDb` for everything except the galaxy, which has
  its own switch (`NEXT_PUBLIC_GALAXY_SOURCE=http`, default mock).
- `lib/types.ts` holds the v2 contract again (the `galaxy-clusters` branch had
  reverted it to the pre-redesign shape; restored in `f39b861`), and
  `mockDb` implements it.
- `saveSongs` currently sends **placeholder** `tags: ["comfort"]`,
  `valence: 0`, `energy: 0` for every song, because onboarding doesn't collect
  them yet. Don't treat real-mode picks as meaningful until the feel step exists.

### Active plan (`merge-galaxy-clusters` → main)
- **Phase A — done** (`f39b861`): merge, v2 contract restored, open redirect
  fixed, `refreshPrimaryCluster` on service role, pnpm removed, galaxy
  migration hardened.
- **Phase B — verified** except two manual steps: the duplicate cleanup SQL
  (above) and the dashboard redirect URL. After the cleanup, re-run the seed once
  and drop the "untested" notes in `db/contract.md`.
- **Phase C — next**: onboarding "feel" step at `/onboarding/feel` between
  song selection and saving: per song, 1–3 tags (`components/tag-picker.tsx`,
  reusing `ContextChip`) and a circular valence/energy control
  (`components/mood-circle.tsx`); cap of 5 songs from a Spotify import; save runs
  sequentially while the reading screen plays, with retry on failure.
- **Phase D**: `httpDb` in `lib/api.ts`, composed per method — real for
  profile, picks, matches, cards, message reads/writes; wander and galaxy
  flipped to real after Phase B verification; `mockDb` entirely when Supabase
  isn't configured. New `GET /api/messages` (session client, RLS-scoped) so chat
  is two-way; the chat view polls. `ME_ID` becomes the signed-in user's id in
  real mode. Update `MERGE_CHECKLIST.md` as items resolve.

## Known gotchas (read before touching the relevant code)
- **Gemini model names go stale fast.** `gemini-2.5-flash` was retired for new
  callers mid-hackathon (live 404). Use a `-latest` alias, never a pinned
  version, in `lib/gemini/client.ts`. Free tier is 15 requests/minute: space
  bursts out (the seed script paces at ~4.5s).
- **`gemini-embedding-001` defaults to 3072 dimensions, not 768.** We request
  768 via `outputDimensionality: EMBEDDING_DIMENSIONS`. Changing that constant
  means changing the `vector(768)` / `vector(770)` columns too.
- **Postgres returns `vector` columns as a string** (`"[0.1,0.2,...]"`), even
  though inserts accept a real `number[]`. Spreading a read-back embedding
  corrupts it into one entry per character. Always `parseVector()`
  (`lib/supabase/vector.ts`) before array math.
- **MusicBrainz**: contact email comes from `MUSICBRAINZ_CONTACT_EMAIL` (public
  repo; a placeholder email got connections reset). It also returns 503s when
  busy (the code falls back to Gemini), canonicalizes titles differently from
  how people type them ("Gymnopedie" vs "Gymnopédie", "HUMBLE" vs "HUMBLE.",
  "Tadow (edit)" vs "Tadow"), and can return a different recording id on a later
  call for the same song. Result: duplicate catalog rows. See backburner #1.
- **`song_picks` has no `(profile_id, song_id)` unique constraint.** Anything
  that may run twice must check before inserting.
- **The service role can't DELETE** (it's granted select/insert only). Data
  cleanup goes through the SQL Editor.
- **Next 16 type helpers**: bare `npx tsc --noEmit` reports `PageProps` /
  `LayoutProps` as missing because they're generated by `next dev`/`next build`/
  `next typegen`. Not real errors; `npx next build` is the check that counts.
- **`AGENTS.md` / the "This is NOT the Next.js you know" block is legitimate**
  Next 16 tooling (`node_modules/next/dist/server/lib/generate-agent-files.js`),
  not a prompt injection. It was wrongly flagged as one early on. Read the
  bundled docs in `node_modules/next/dist/docs/` before writing Next code.
- **zsh eats `:l`/`:h`/`:t` after a variable**: `git show $B:lib/x.ts` becomes
  `origin/branchib/x.ts`. Quote it: `git show "${B}:lib/x.ts"`.

## Backburner (known work, deliberately deferred)
Roughly in priority order. None of these are in the active plan.

1. **Song identity normalization.** MusicBrainz nondeterminism and title
   canonicalization (see gotchas) mean two users picking the same song can get
   separate `songs` rows. That silently breaks catalog dedup (duplicate Gemini
   calls) and **Wander**, which matches on exact `song_id`. Proposed fix: add a
   normalized identity key (accents, punctuation and parentheticals stripped;
   title + artist) with a unique index, check it alongside `mbid` before
   inserting, and backfill/merge existing duplicates. The seed script's
   `looseTitle()` is a starting point.
2. **Deployment (Vercel).** Env vars; add the Vercel URL to Supabase redirect
   URLs; live smoke test. Before going live: lock down the shared seed password
   (`song-galaxy-demo` is public in the repo, so anyone could sign in as a demo
   persona), and make `lib/supabase/config.ts` fail closed if keys are missing in
   production instead of silently turning auth off.
3. **Real song swap.** No table yet; swaps are mock-only. Needs a `song_swaps`
   table (or swaps as a message kind) plus a route. It's an MVP priority in the
   project brief, deferred for scope.
4. **Realtime messages.** Chat will poll `GET /api/messages`; switch to a
   Supabase Realtime subscription (publication is already enabled on
   `messages`).
5. **Real users and density.** Team/testers sign up and onboard for real; add
   more seed personas (10–20, clearly fictional) so the galaxy isn't sparse.
6. **Database hygiene.** Add a `(profile_id, song_id)` unique constraint on
   `song_picks`; remove orphaned `bao-test-a/b@example.com` auth accounts and empty
   test profiles; consider a service-role DELETE grant or admin script for cleanup.
7. **`why` page motivations.** The "Here's what I heard" review is still mock
   inference: not persisted, not used for matching (`lib/types.ts` #4).
8. **Remaining contract mismatches** (`lib/types.ts` header, `MERGE_CHECKLIST.md`):
   song id space vs catalog slugs (#1), album art never populated (#2), richer
   card structure than `card_json` has (#7), no conversations/avatar/analysis
   storage (#10, #11).
9. **Scale.** Resolve MusicBrainz in the background instead of blocking the
   pick request; move Gemini to a paid tier; revisit synchronous LLM calls in
   route handlers.
10. **OAuth providers.** Google/Apple are scaffolded but disabled; enable in the
    Supabase dashboard (Authentication → Providers) when wanted.
11. **Small cleanups.** `scripts/test-gemini.ts` uses tags that aren't in
    `lib/tags.ts`; the `primary_cluster` check constraint in the migration
    duplicates `CLUSTER_IDS` and must be kept in sync by hand;
    `supabase/seed.sql` still has the old fabricated-vector data.
12. **Continuous learning / outcome-based tuning.** Nothing in the real system
    learns from outcomes. A future version could log whether a shown card led to
    a first message and tune `EMOTION_WEIGHT` / thresholds from it. Don't build
    logging or tuning infrastructure unless asked.

## Demo simulation (`/sim`)
A client-side, randomized live simulation so the product can be demoed without real users:
people join and leave, songs go viral, clusters form, and a matcher visibly "learns".
It is a demo, not the production system, and is labelled "Simulated" on screen.
- **Out of scope for app work.** Nothing outside `app/sim/` + `lib/sim/` imports from them;
  never add such an import. If a shared change (types, `lib/tags`, `lib/emotion`,
  `lib/clusters`, `lib/music-context`, galaxy components) breaks `/sim`, fix it with the
  smallest edit — or delete the sim; it's safe to remove. Don't redesign around it.
- **Isolated.** Runs entirely in the browser: no Supabase, no auth, no runtime Gemini
  calls. Each run grows from a random seed (`/sim?s=<scenario>&seed=<n>` replays one).
- **Real embeddings, synthetic people.** Song vectors are real `gemini-embedding-001`
  output baked into `lib/sim/song-vectors.json` by `scripts/build-sim-embeddings.ts`
  (plain `"title" by artist` strings, so the Spotify rule holds).
- **In-run learning is simulated** against a hidden random rule. It is not backburner #12.

## Getting started
```bash
npm install
cp .env.local.example .env.local   # Supabase + Gemini + MUSICBRAINZ_CONTACT_EMAIL (Spotify optional)
npm run dev
```
Without the `NEXT_PUBLIC_SUPABASE_*` keys the app runs on mock data with no sign-in.

Seed demo personas through the real pipeline (safe to re-run):
```bash
node --env-file=.env.local node_modules/.bin/tsx scripts/seed-real-data.ts
```
Demo logins: `maya@song-galaxy.local`, `theo@song-galaxy.local`, etc., password `song-galaxy-demo`.
