# Song Galaxy — CLAUDE.md

Full product pitch is in `README.md`. This file is for anyone (or any
Claude Code session) writing code in this repo — stack, conventions, and
the rules that must not be broken.

**This file is only edited when explicitly asked for.** Don't rewrite it
as a side effect of an unrelated architecture or code change — update
`db/contract.md` and the code instead, and leave this file alone unless
someone specifically asks for a CLAUDE.md update.

Last full update: 2026-09-26, after the AI portraits + whole-profile connection assessment
(`ai-portraits`, `89fee8a`), the matching-balance fix (`b5f84e3`) and the galaxy "+" fix (`d9614b5`).

## Team split
- **Anish** — backend (routes, Supabase glue, Gemini/MusicBrainz pipeline, matching) and, since
  2026-09-26, the database (schema, migrations, RLS, `db/contract.md`).
- **James** — frontend (onboarding, auth UI / `login-signup`, email-confirmation handoff, Messages
  and Profile screens).
- **Daniel** — galaxy frontend (clusters, why-mix placement, galaxy window, hop, wander UI), the
  real-data wiring of `lib/api.ts` (`lib/http-db.ts`, `lib/real-api.ts`), cover art, and the `/sim` demo.
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
| Messaging | Supabase `messages` table; the app polls `GET /api/messages` (Realtime publication is enabled but no client subscribes yet) |
| Album art | Cover Art Archive → iTunes → Deezer (`lib/cover-art.ts`), looked up when a song enters the catalog |
| LLM | Google Gemini API: `gemini-flash-latest` → `gemini-flash-lite-latest` fallback for portraits and connection assessment (`GEMINI_JUDGMENT_MODELS`), `gemini-flash-lite-latest` for song context and contrast cards, `gemini-embedding-001` at 768 dims for vectors |
| Song identity | MusicBrainz API (primary), Gemini (fallback only) — see below |
| Music data (optional) | Spotify Web API — OAuth top-tracks import only, display purposes only |
| Package manager | **npm only** (`package-lock.json`). Never commit `pnpm-lock.yaml` / `pnpm-workspace.yaml` |
| Hosting | Vercel (not deployed yet) |

## Directory map
```
app/api/                     Route handlers — the only thing the frontend calls
  picks/                     POST: resolve song (MusicBrainz → Gemini), cover art, save song_pick, refresh cluster.
                             One pick per (profile, song): re-picking updates it (newest feelings win).
                             PATCH {id, tags, valence, energy}: edit a pick in place. DELETE ?id=: remove one.
  match/                     GET: pgvector candidates → AI evidence-check → confirmed matches with cards
                             (cached pairs aren't re-sent to Gemini)
  cards/[matchId]/           GET cached card / POST assess a specific pair (same AI assessment as /api/match)
  portrait/                  GET my stored listening portrait (session client, owner-only RLS) / POST regenerate it
  profile/                   GET ?id=<uuid|me> profile + picks (private picks only for the owner) / POST display name
  messages/                  GET ?with=<profileId> (session client, RLS-scoped) / POST send
  galaxy/, galaxy/more/      GET bounded galaxy window / page one cluster; ?center=<id> hops (403 if not in your window)
  galaxy/songs/              GET the song layer for your window (no Gemini)
  wander/                    POST "same song, different feeling" contrast cards
  spotify/                   Optional OAuth top-tracks import
app/auth/callback/           Supabase OAuth / email-confirmation landing (exchanges code for session)
app/auth/confirmed/          Email-confirmation tab handoff back to the tab that signed up (lib/auth-handoff.ts)
app/login/, app/signup/      Auth screens (components/auth/auth-form.tsx)
app/onboarding/              music (Spotify or manual) → pick → feel → reading → why → reveal
app/onboarding/pick/         Manual path: search + check 5–10 songs. Selection only; no tags here
app/onboarding/feel/         Per song: 1–3 tags + the valence/energy mood circle (one song at a time)
app/(tabs)/                  galaxy, connections, messages, people/[id] (+ /card, /contrast), me
app/proto/                   Prototype screens (pick-constellation, reading-constellation); not linked from the app
app/sim/, lib/sim/           /sim demo ONLY — see "Demo simulation" below; never import from app code
components/                  UI components; components/galaxy/ holds the 3D scene + SVG fallback
components/mood-circle.tsx   The circular valence/energy control (drag, tap, arrow keys; clamped to the circle)
components/tag-picker.tsx    1–3 tags from lib/tags.ts as ContextChip chips
proxy.ts                     Next 16's middleware: refreshes the session cookie, gates app screens
lib/data-source.ts           REAL_DATA: real backend whenever Supabase keys are set (NEXT_PUBLIC_DATA_SOURCE=mock overrides)
lib/api.ts                   The frontend's single data-access seam: `db = REAL_DATA ? httpDb : mockDb`
lib/http-db.ts               Real implementation of the v2 Db contract over the API routes
lib/real-api.ts              Real-mode bodies for the view functions (getMe, getConnections, getConversation, …)
lib/mock-db.ts               Mock implementation of the v2 Db contract (demo mode)
lib/mock-world.ts            Mock people/songs used by mock-db and "NOT IN CONTRACT" enrichment
lib/types.ts                 View types (UI) + "DB contract rows" (v2) + the Db interface
lib/session.ts               Client session store (onboarding songs, feelings, save status, read state)
lib/galaxy-adapter.ts        Maps GET /api/galaxy responses to the galaxy view types
lib/why-mix.ts               Five-why listening mix; places people between their top two whys
lib/song-connections.ts, lib/connection-groups.ts, lib/read-state.ts  Song-star connections, grouped
                             connections list, unread state for Messages
lib/cover-art.ts             Album art lookup chain (Cover Art Archive → iTunes → Deezer)
lib/supabase/                server.ts (service role), serverAuth.ts (session), browser.ts (client),
                             proxy.ts (session refresh), config.ts (keys present?), vector.ts (parseVector)
lib/musicbrainz/             Song identity resolution (title/artist → canonical mbid)
lib/portrait.ts              Portrait + CardThread types (the portrait JSON and match-card threads)
lib/gemini/                  Song context + embedding, contrast cards, and the AI judgment calls:
                             json.ts (generateJson: enforced-JSON schema + Flash → Flash-Lite fallback),
                             generatePortrait.ts (listening portrait), assessConnection.ts (whole-profile
                             match judgment + score + card). evaluateAndGenerateCard.ts is legacy
                             (only scripts/test-gemini.ts and a shared type still use it)
lib/matching/                findMatches (match_picks → assessConnection), portraits.ts (loadPublicPicks,
                             getPortraits, upsertPortrait), findWander (wander_picks), galaxyWindow,
                             galaxySongs, refreshPrimaryCluster, alignCardEvidence, cosineSimilarity
lib/cluster-assign.ts        Tags + valence/energy → one of five clusters (no LLM, no embeddings)
lib/clusters.ts              The five cluster ids/labels/colors (CLUSTER_IDS)
lib/tags.ts                  Fixed mood/context tag taxonomy (10 tags)
lib/emotion.ts               EMOTION_WEIGHT + clampEmotionValue
lib/safe-next.ts             safeNextPath(): the only allowed way to use an untrusted ?next= value
supabase/migrations/         The real schema, applied in order via the SQL Editor (see status)
supabase/seed.sql            Old fabricated-vector seed; superseded by scripts/seed-real-data.ts
scripts/seed-real-data.ts    Seeds demo personas through the real MusicBrainz + Gemini pipeline
scripts/test-gemini.ts       Standalone Gemini smoke test (no DB writes)
scripts/backfill-cover-art.ts  Fills songs.album_art_url for catalog rows that predate cover-art lookup
scripts/generate-portraits.ts  Backfills profile_portraits for every profile with public picks (--force redoes all)
scripts/recompute-pick-embeddings.ts  Rewrites every song_picks.embedding after an EMOTION_WEIGHT/formula change
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
appended. The song embedding is L2-normalized first and `EMOTION_WEIGHT` is 0.7, so the
song's meaning leads and mood is a deliberate minority share (the formula lives only in
`buildPickEmbedding`, `lib/matching/pickEmbedding.ts`). Nothing is averaged into a profile-level vector — averaging would
bury a strong specific match (e.g. one shared grief song) under someone's
unrelated other picks. `match_picks` finds the best pick pair per candidate
profile.

**AI does real judgment, not just narration.** Two parts:
- **Listening portrait** (`profile_portraits`, `lib/gemini/generatePortrait.ts`): Gemini reads
  a person's public picks (title, artist, the song's context summary, their tags, mood, own
  words) into a headline, 3 highlights, 2–4 motivations (each with a cluster, confidence and
  evidence citing their real song titles), plus `seeks`/`tensions` used only server-side.
  Shown back to its owner on the reading/why/Me screens; owner-only RLS. Regenerated by
  `POST /api/portrait` when the pick count changes (onboarding, galaxy "+").
- **Connection assessment** (`lib/gemini/assessConnection.ts`): pgvector `match_picks` is only
  the **pre-filter** (and its best pair a hint). Gemini then reads both whole profiles — both
  portraits and every public pick — and either confirms a match with a 0–100 `score`, a
  `rationale`, and 1–2 `threads` each anchored by a real song on each side, or the candidate
  is dropped (also dropped: score < 40, or no thread whose songs really exist). `GET /api/match`
  orders by `score` and the UI shows it as the match %. At most 5 new assessments per request,
  sequential; cached cards are reused; rejected pairs are remembered in memory until either
  person's pick count changes. Cards are seen by both people, so they must never quote or
  paraphrase anyone's portrait.

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
  The callback, login page, auth form, `/auth/confirmed` and `lib/auth-handoff.ts` all use it.
- Email signup: the confirmation link carries `?via=email&next=…` to `/auth/callback`, which
  sends it to `/auth/confirmed` so the original tab can pick the session up. Supabase's
  Redirect URLs must allow those query strings — use `http://localhost:3000/**`, not an
  exact `/auth/callback` entry (see status).

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
- **Pull before you push**, and bring uncommitted work along safely:
  ```bash
  git stash push -u -m "wip"   # -u includes new (untracked) files
  git pull origin main
  git stash pop                # on conflict: keep both sides if they do different things,
                               # delete the <<<<<<< ======= >>>>>>> lines, git add <file>, git stash drop
  npx tsc --noEmit && npx next build
  ```
  Stop any running `npm run dev` before `next build` (both write to `.next/`). Never force-push `main`.
- **Data modes** (`lib/data-source.ts`): with Supabase keys in `.env.local` the app is signed-in
  only and uses the **real** backend — anything you do in onboarding writes real rows. To try
  UI on demo data with no login, blank the keys for that run:
  `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev`.
  (`NEXT_PUBLIC_DATA_SOURCE=mock` also forces demo data, but login is still required.)

## Implementation status (2026-09-26)

### Live database (hosted Supabase project)
- Applied, in order: `20260926010000_song_galaxy_schema.sql`,
  `20260926020000_grant_service_role_backend_privileges.sql`,
  `20260927000000_profile_name_from_oauth.sql` (signup no longer fails on names
  over 80 chars), `20260927010000_galaxy_window.sql` (`primary_cluster`,
  `wander_picks`, `galaxy_pool`, `galaxy_cluster_counts`),
  `20260927020000_service_role_update_pick_embedding.sql` (lets the recompute script
  rewrite `song_picks.embedding`), `20260927030000_profile_portraits.sql` (portraits table,
  owner-only select, service-role write).
- Seeded by `scripts/seed-real-data.ts`: Maya, Theo, Jordan, Amara, Noor, Sam
  (password `song-galaxy-demo`), 27 picks resolved through real MusicBrainz +
  Gemini, including a deliberate wander pair (Sam and Noor both picked
  "Landslide", opposite feelings). Every persona has a `primary_cluster` and a portrait
  (the seed now writes portraits too). Daniel, several James test accounts and Jason PG
  have real accounts; only "James Armendariz5" has picks (and a portrait).
- All 27 seeded pick embeddings were recomputed with the balanced formula (`b5f84e3`).
- A MusicBrainz-throttled re-run of the seed once created 3 duplicate picks and
  3 duplicate catalog rows; they were deleted in the SQL Editor on 2026-09-26
  and clusters recomputed. The seed script is now idempotent (loose title match
  per persona, checked before any MusicBrainz/Gemini call).
- Demo data: cached match cards for Maya's matches and a contrast card for Sam/Noor. The
  verification messages were deleted (the `messages` table was empty afterwards). **Maya's
  older match cards predate the assessment** (no score/threads) and are never regenerated;
  to rebuild them with scores, run in the SQL Editor:
  `delete from public.connection_cards where card_json->>'kind' is distinct from 'contrast';`
- **Dashboard step (done for localhost)**: Site URL `http://localhost:3000`, Redirect URLs
  include `http://localhost:3000/**` (the wildcard is needed because email-confirmation links
  add `?via=email&next=…`). Add the Vercel URL the same way at deploy time.

### Backend
Every route above is implemented against the v2 schema with session auth.
Verified end to end on 2026-09-26 against the live DB, signed in through the
real `@supabase/ssr` cookie flow: `GET /api/match`, `GET /api/cards/:id` (cache hit),
`POST /api/wander` (Sam → Noor on "Landslide", `kind: "contrast"`),
`GET /api/galaxy` (bounded window + hidden counts), `POST /api/messages` + two-way
chat (Maya ↔ Theo), `GET /api/profile`, `POST /api/picks` with real tags/mood (stored
vector = unit-length song part + mood × 0.7); signed-out calls return 401. RPCs
`wander_picks`, `galaxy_pool`, `galaxy_cluster_counts` return correct rows; signup with a
120-char name is truncated to 80 instead of failing.

**Matching balance — fixed** (`b5f84e3`). The raw 768-dim song embedding had norm ~0.59 while
the mood dims (× the old `EMOTION_WEIGHT` = 5) had ~3.16, so cosine was ~95% slider position.
Now the song part is normalized and the weight is 0.7; every pick was recomputed
(`scripts/recompute-pick-embeddings.ts`). Maya's candidates moved from ~0.99 to 0.63–0.69.

**AI portraits + assessment — verified** (`ai-portraits`, merged 2026-09-26): portraits for all
7 profiles with picks; RLS checked with a real login (signed out: denied; Maya sees only her
own row; user updates denied); `findMatches` for Maya made 2 new AI-scored matches on a cold
call (6.2s; James Armendariz5 and Noor, both score 85 — Noor at only 0.32 cosine, a pair the
old math ranked last) and served everything from cache on the second (0.17s). The Flash → Lite
fallback fired live (Flash was returning 503). **Not yet clicked through in a browser**:
onboarding's reading/why screens showing the real portrait, and the Me page loading it.

### Frontend
- **Real-data mode is live** (Daniel, `0a615ce`): whenever Supabase keys are set,
  `lib/api.ts` uses `httpDb` (`lib/http-db.ts`) and `lib/real-api.ts` instead of the mock
  world. Profile, picks, matches (with cached cards), cards, wander, galaxy (+ hop and the
  song layer), and messages (send + polled reads) all hit the real routes. With no keys, or
  `NEXT_PUBLIC_DATA_SOURCE=mock`, it's the demo data. `mockDb` still implements the v2 `Db`.
- **Onboarding feel step is live** (`2fb87c0`): music (Spotify or manual) → pick → **feel**
  → reading → why → reveal. Per song, 1–3 tags and a mood-circle position; a Spotify import
  is capped to 5 songs to describe. `chooseSongs` stores the songs (session only);
  `saveSongs` then saves each described song sequentially while the reading screen plays,
  and the reading screen waits for it, with a retry that skips songs already saved (no
  duplicate picks). In real mode these are real `POST /api/picks` writes with the user's
  own tags/valence/energy.
- **Real portrait in real mode**: `analyzeMusic` waits for `saveSongs`, then `POST /api/portrait`
  (mapped to `AnalysisResult`, song titles → the user's real pick ids) and warms `/api/match` in
  the background. The Me page loads the stored portrait (`GET /api/portrait`) when this browser's
  session has none. Mock mode still uses `lib/inference.ts`.
- **Connections** show the AI `score` as the match %, and cards map `card_json.threads` to 1–2
  shared motivations with real songs on each side (older cards fall back to `shared_why`).
- The galaxy "+" add-a-song uses `TagPicker` + `MoodCircle` (`d9614b5`) and refreshes the
  portrait in the background after saving.
- Motivation feedback (confirm/reject/private) on the why/Me screens is still session-only (#4).
- **Songs are managed, not appended** (`song-tag-management`): `song_picks` is unique per
  (profile, song) (`20260928000000_one_pick_per_song.sql` — dedupes existing rows keeping the
  newest, adds `updated_at`, grants the service role update/delete). Profile → tap a song to change
  how it feels or remove it (`components/song-feeling-sheet.tsx`); "Add or change songs" re-runs the
  picker, which marks songs you already have ("Yours"), needs only 1 song once you have some, and
  pre-fills the feel step with your saved answers. Portraits regenerate when any pick changes, not
  just the count (`profile_portraits.picks_updated_at`). **Apply the migration to the hosted project
  before deploying this code.**
- **Galaxy "you" fix** (`lib/matching/galaxyWindow.ts`): `galaxy_pool` excludes the viewer, and
  the window only added an anchor node when hopped, so in real mode your own galaxy had no "you"
  star and every edge from you was dropped. The center now always gets its node. Your edges also go
  to your top 12 by similarity instead of the sampler's "match" slice, which a small galaxy (one
  that fits the budget) never produces, so new users no longer show zero connections.
- Album art is now populated (Cover Art Archive → iTunes → Deezer, or a Spotify `i.scdn.co`
  URL passed in); `scripts/backfill-cover-art.ts` fills older catalog rows.

### Plan status
- **Phase A — done** (`f39b861`): merge, v2 contract restored, open redirect
  fixed, `refreshPrimaryCluster` on service role, pnpm removed, galaxy
  migration hardened.
- **Phase B — done and verified** (migrations applied, seed idempotent, RPCs and
  routes checked with real sessions).
- **Phase C — done** (`2fb87c0`): the onboarding feel step (above).
- **Phase D — done by Daniel** as real-data mode (`0a615ce`), verified end to end by the
  backend side on 2026-09-26.
- **Matching balance, galaxy "+", demo prep — done** (`b5f84e3`, `d9614b5`).
- **AI portraits + whole-profile assessment — done and merged** (`docs/plans/ai-portraits.md`).

### Next up (in order)
1. **Clear Maya's pre-assessment match cards** (SQL above) so the demo shows scored cards with threads.
2. **Click through the portrait in a browser**: new signup → feel → reading highlights → why
   motivations from the real portrait → reveal → Connections scores; then the Me page on a
   fresh browser (stored portrait).
3. **Density**: more seed personas (backburner #5) so the assessment has more to choose from;
   the seed writes portraits automatically.
4. **Deployment** (backburner #2), including locking down the public seed password.

## Known gotchas (read before touching the relevant code)
- **Gemini model names go stale fast.** `gemini-2.5-flash` was retired for new
  callers mid-hackathon (live 404). Use a `-latest` alias, never a pinned
  version, in `lib/gemini/client.ts`. Free tier is 15 requests/minute: space
  bursts out (the seed script paces at ~4.5s).
- **`gemini-flash-latest` returns 503 (high demand) often.** The judgment calls go through
  `generateJson` (`lib/gemini/json.ts`), which falls back to Flash-Lite on 429/500/503/404.
  Use it for any new structured Gemini call instead of hand-parsing JSON.
- **Portraits are private.** Another person's portrait is only ever an input to
  `assessConnection`; never return it from a route or let card text quote it.
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
4. **Realtime messages.** Chat polls `GET /api/messages` today; switch to a
   Supabase Realtime subscription (publication is already enabled on
   `messages`).
5. **Real users and density.** Team/testers sign up and onboard for real; add
   more seed personas (10–20, clearly fictional) so the galaxy isn't sparse.
6. **Database hygiene.** Add a `(profile_id, song_id)` unique constraint on
   `song_picks`; remove orphaned `bao-test-a/b@example.com` auth accounts and empty
   test profiles; consider a service-role DELETE grant or admin script for cleanup.
7. **`why` page motivation feedback.** The motivations are now real (the portrait), but
   confirm/reject/private feedback is session-only and doesn't reach the portrait or
   matching. Was: the "Here's what I heard" review is still mock
   inference: not persisted, not used for matching (`lib/types.ts` #4).
8. **Remaining contract mismatches** (`lib/types.ts` header, `MERGE_CHECKLIST.md`):
   song id space vs catalog slugs (#1), richer card structure than `card_json`
   has (#7), no conversations/avatar/analysis storage (#10, #11). (#2, album art,
   is resolved by `lib/cover-art.ts`.)
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
With the Supabase keys set, the app requires sign-in and uses the **real** backend
(onboarding writes real rows). To try UI on demo data with no sign-in:
```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev
```

Generate listening portraits for existing profiles (after migration `20260927030000`; paced,
skips up-to-date ones; `--force` regenerates all):
```bash
node --env-file=.env.local node_modules/.bin/tsx scripts/generate-portraits.ts
```

Seed demo personas through the real pipeline (safe to re-run):
```bash
node --env-file=.env.local node_modules/.bin/tsx scripts/seed-real-data.ts
```
Demo logins: `maya@song-galaxy.local`, `theo@song-galaxy.local`, etc., password `song-galaxy-demo`.
