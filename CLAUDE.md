# Song Galaxy — CLAUDE.md

Full product pitch is in `README.md`. This file is for anyone (or any
Claude Code session) writing code in this repo — stack, conventions, and
the rules that must not be broken.

**This file is only edited when explicitly asked for.** Don't rewrite it
as a side effect of an unrelated architecture or code change — update
`db/contract.md` and the code instead, and leave this file alone unless
someone specifically asks for a CLAUDE.md update.

Last full update: 2026-09-27 (night, `main` at `45121ca`). Since the previous one: a **laptop
layout** (the app fills the window, the galaxy is the centerpiece) with **redesigned navigation**
(frosted glass, a floating capsule, a gliding/squishing highlight with a moving gold-violet ring);
a **full-screen landing page**; a **galaxy build-out intro**; **matte star icons** instead of
cluster color dots; a **shared-feelings badge** instead of "0 songs in common"; the **"New"
cluster race** fixed; Daniel's **cluster HUD**, **avatar customizer** and topic-cluster renames
(plus a migration so the live labels match); James's **editable avatars** and **faster cards**;
An's **onboarding guard, smooth mood circle and default song list** (with "Popular on Song
Galaxy"); and Daniel's **listening-history import**, merged but **switched off** (its migrations
are not applied).

Earlier the same day: **100 fictional test users** (`scripts/seed-test-users.ts`); the star sheet
shows a person's songs (`2c30568`); **Google sign-in** is live and the only social login (Apple removed,
`9cd451b`); Daniel's **topic clusters** landed and their migration was applied in an additive
form, with a transition bridge and James's missing-table fallbacks (`d66d3e2`); James's **latency
pass** (`9850f56`); **the team's own accounts were deleted**.

Before that: deployed on Vercel (`https://song-galaxy-nu.vercel.app`, auto-deploys `main`); feeling
tags replaced the situation tags (`e3e7336`) and the demo personas were retagged by hand
(`32274f5`); match scores are computed from a rubric (`a7f775a`); song previews (`cee5be6`);
faster AI (`88a5f60`); Gemini on a paid tier; demo password out of the repo; James's
one-pick-per-song + manage songs on Profile; Daniel's `/pitch` + 3D reading constellation.

## Team split
- **Anish** — backend (routes, Supabase glue, Gemini/MusicBrainz pipeline, matching), the
  database (schema, migrations, RLS, `db/contract.md`) since 2026-09-26, and deployment.
- **James** — frontend (onboarding, auth UI / `login-signup`, email-confirmation handoff, Messages
  and Profile screens, song management on Profile).
- **Daniel** — galaxy frontend (clusters, why-mix placement, galaxy window, hop, wander UI), the
  real-data wiring of `lib/api.ts` (`lib/http-db.ts`, `lib/real-api.ts`), cover art, the `/sim`
  demo, the 3D reading-constellation, `/pitch` (the scripted social-discovery-loop demo), the
  cluster HUD, the avatar customizer, topic clusters, and the (dormant) listening-history import.
- **Bao / An** (Nguyễn Quốc Bảo An) — floating backend/frontend (Gemini testing, early schema work,
  the Spotify connect route, the onboarding guard, smooth mood circle and default song list).
  Works in small branches (`An/…`, `An-…`); Anish reviews and merges them.
- Anish also did the laptop layout, navigation redesign and galaxy intro (2026-09-27). UI work is
  spread across the whole team now, so **UI files conflict easily**: before merging anything to
  `main`, fetch, look at what teammates pushed, and check conflicts (see Working conventions).

## Tech stack
| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), one repo for frontend + backend. **Not the Next.js in your training data** — see `AGENTS.md` and `node_modules/next/dist/docs/` |
| Styling | Tailwind CSS |
| Galaxy visualization | react-three-fiber (three.js) + d3-force-3d layout, SVG fallback |
| UI components / motion | shadcn/ui (Base UI), lucide-react, anime.js; Web Animations API for the sliding nav highlight |
| Layout | Phone-first. At `lg` (≥1024px) the app fills the window: the galaxy and landing run full width, other screens sit in a 720px centered column (`components/phone-frame.tsx`) |
| Backend | Next.js Route Handlers (`app/api/`) |
| Database | Supabase (Postgres) + pgvector |
| Auth | Supabase Auth (cookie sessions via `@supabase/ssr`): email/password and **Google** (the only social login; Apple removed). Sessions are checked with `getClaims()` (local JWT verification) in the proxy and route handlers |
| Messaging | Supabase `messages` table; the app polls `GET /api/messages` (Realtime publication is enabled but no client subscribes yet) |
| Album art | Cover Art Archive → iTunes → Deezer (`lib/cover-art.ts`), looked up when a song enters the catalog |
| LLM | Google Gemini API, **paid tier** (billing on since 2026-09-26): `gemini-flash-latest` → `gemini-flash-lite-latest` fallback for portraits and connection assessment (`GEMINI_JUDGMENT_MODELS`, thinking capped at 1024 tokens), `gemini-flash-lite-latest` for song context and contrast cards, `gemini-embedding-001` at 768 dims for vectors |
| Song identity | MusicBrainz API (primary), Gemini (fallback only) — see below |
| Song search + previews | Deezer search API (popularity-ranked), iTunes Search fallback — `GET /api/songs/search` (with 30s preview links), `GET /api/songs/preview`; no keys |
| Music data (not in the UI) | Spotify Web API — OAuth top-tracks routes exist, but nothing links to them (see status) |
| Listening history (off) | Last.fm / ListenBrainz import (Daniel), behind `LISTENING_ENABLED`; unset everywhere, migrations not applied (see status) |
| Package manager | **npm only** (`package-lock.json`). Never commit `pnpm-lock.yaml` / `pnpm-workspace.yaml` |
| Hosting | **Vercel**, live at `https://song-galaxy-nu.vercel.app`. Every push to `main` deploys to production automatically; other branches get preview URLs |

## Directory map
```
app/api/                     Route handlers — the only thing the frontend calls
  picks/                     POST: resolve song (MusicBrainz → Gemini), cover art, save song_pick, refresh cluster.
                             One pick per (profile, song): re-picking updates it (newest feelings win).
                             PATCH {id, tags, valence, energy}: edit a pick in place. DELETE ?id=: remove one.
  match/                     GET: pgvector candidates → AI assessment (rubric score) → confirmed matches with cards
                             (cached pairs aren't re-sent to Gemini)
  cards/[matchId]/           GET cached card / POST assess a specific pair (same AI assessment as /api/match)
  portrait/                  GET my stored listening portrait (session client, owner-only RLS) / POST regenerate it
  profile/                   GET ?id=<uuid|me> profile + picks (private picks only for the owner) / POST display name
  messages/                  GET ?with=<profileId> (session client, RLS-scoped) / POST send
  galaxy/, galaxy/more/      GET bounded galaxy window / page one cluster; ?center=<id> hops (403 if not in your window)
  galaxy/songs/              GET the song layer for your window (no Gemini)
  wander/                    POST "same song, different feeling" contrast cards
  clusters/                  GET the live topic_clusters set for the client's cluster cache ([] if the table is missing)
  songs/search/              GET ?q= real catalog search for picks and swaps (Deezer → iTunes), ≥2 chars, each result
                             with a ~30s previewUrl; cached 5 min (Deezer preview links expire after ~15 min).
                             With no ?q=, the picker's default list: `communityFavorites()` (public picks ranked by
                             distinct pickers, ids `catalog:<uuid>`; needs ≥6 songs with ≥2 pickers) → else
                             An's Deezer/iTunes charts; returns `source: "community" | "chart"`
  avatar/, avatar/photo/     James: save the profile icon (profiles.avatar, lib/avatar.ts); upload/delete a photo
                             (profiles.avatar_url, public `avatars` bucket, service role after a session check)
  listening/*, capabilities/ Daniel's listening-history import (connections, jobs, preferences, sync) and a flags
                             route; dormant unless LISTENING_ENABLED is set (see status)
  songs/preview/             GET ?id=deezer:<id>|itunes:<id> or ?title=&artist= → a fresh preview link
  spotify/                   connect (one-time state cookie) / callback / top-tracks. Unreachable from the UI
                             (Spotify development mode, see status); kept for a possible playlist import
app/auth/callback/           Google + email-confirmation landing (exchanges code for session); a Google sign-in with
                             no songs yet goes to /onboarding/pick instead of an empty galaxy
app/auth/confirmed/          Email-confirmation tab handoff back to the tab that signed up (lib/auth-handoff.ts)
app/login/, app/signup/      Auth screens (components/auth/auth-form.tsx): email/password + "Continue with Google"
app/onboarding/              pick → feel → reading → why → reveal. /onboarding/music is only a redirect to pick
app/onboarding/pick/         Search + check 5–10 songs (1+ once you have some), play button per result. No tags here.
                             Before typing: "Popular on Song Galaxy" / "Trending now" (discoverSongs). An's
                             PickSongsGate sends people who already have songs to the galaxy unless they came
                             from Profile (?mode=manage) or are mid-selection in this session
app/onboarding/feel/         Per song: the valence/energy mood circle FIRST, then 1–3 feeling tags sorted by the dot
app/(tabs)/                  galaxy, connections, messages, people/[id] (+ /card, /contrast), me
app/proto/                   Prototype screens (pick-constellation, reading-constellation); not linked from the app.
                             reading-constellation renders 3D (react-three-fiber) when WebGL is available and motion
                             isn't reduced, via components/reading-constellation-scene.tsx; otherwise SVG.
app/pitch/                   A scripted, end-to-end demo of the social-discovery loop (home → explore → travel to
                             a community → Song Handshake → bring them home), built from the same GalaxyCanvas as
                             the app but with its own "home" arrangement (lib/galaxy-layout.ts: computeHomeLayout,
                             home-only) and a warp-streak overlay (components/pitch/warp-overlay.tsx) during the big
                             camera moves. Data is scripted in app/pitch/script.ts, not live. Not linked from the app.
app/sim/, lib/sim/           /sim demo ONLY — see "Demo simulation" below; never import from app code
components/                  UI components; components/galaxy/ holds the 3D scene + SVG fallback
components/reading-constellation-scene.tsx  The 3D scene for app/proto/reading-constellation (see above)
components/pitch/warp-overlay.tsx  Radial light-streak burst for app/pitch's travel beats (see above)
components/phone-frame.tsx   Laptop layout: FULL_WIDTH routes (/galaxy, /) fill the window, PHONE_ONLY (/pitch, /sim,
                             /proto) keep the phone frame, everything else is a 720px centered column
components/bottom-tab-bar.tsx  Frosted docked bar on phones; a floating glass capsule at lg. Sliding highlight + DuoRing
hooks/use-sliding-indicator.ts  Glides a highlight to the [data-indicator-active] child (transform/size written to
                             style; squish keyframes on its first child; skips ResizeObserver's first report)
components/duo-ring.tsx      Gold/violet SVG outline that travels around its parent (static with reduced motion)
components/cluster-star.tsx  Matte four-point star in a cluster's color (`hollow` for forming themes); used everywhere a
                             cluster color used to be a dot
components/landing-starfield.tsx  The welcome page's starfield: a wide SVG on laptops (Daniel's WIDE_SLOTS + animations)
components/overlap-badge.tsx What two people share: songs, else artists, else their top 3 shared feelings
components/avatar-customizer-sheet.tsx  Daniel: tabbed profile-icon customizer (Profile → "Customize avatar")
components/galaxy/cluster-filter.tsx  Daniel's cluster HUD: a glass capsule that opens a constellation popover
components/mood-circle.tsx   The circular valence/energy control (drag, tap, arrow keys; clamped to the circle).
                             While dragging it moves the dot via requestAnimationFrame; onChange fires on release (An)
components/tag-picker.tsx    1–3 feelings in five rows (one per listening reason), sorted by the mood dot; older
                             picks' original tags shown under "From before"
components/preview-button.tsx  Play/pause a song's 30s preview (lib/preview-player.ts)
components/song-feeling-sheet.tsx  Profile → edit one song's feelings or remove it (James)
proxy.ts                     Next 16's middleware: refreshes the session cookie, gates app screens; on Vercel, missing
                             Supabase keys → 503 (fails closed) instead of the open demo
lib/data-source.ts           REAL_DATA: real backend whenever Supabase keys are set (NEXT_PUBLIC_DATA_SOURCE=mock overrides)
lib/api.ts                   The frontend's single data-access seam: `db = REAL_DATA ? httpDb : mockDb`
lib/http-db.ts               Real implementation of the v2 Db contract over the API routes
lib/real-api.ts              Real-mode bodies for the view functions (getMe, getConnections, searchSongs, …)
lib/mock-db.ts               Mock implementation of the v2 Db contract (demo mode)
lib/mock-world.ts            Mock people/songs used by mock-db and "NOT IN CONTRACT" enrichment
lib/types.ts                 View types (UI) + "DB contract rows" (v2) + the Db interface
lib/session.ts               Client session store (onboarding songs, feelings, save status, read state)
lib/preview-player.ts        One shared audio element for previews (one clip at a time; stale-link retry)
lib/galaxy-adapter.ts        Maps GET /api/galaxy responses to the galaxy view types
lib/galaxy-layout.ts         computeLayout (real galaxy, "whys" arrangement) and computeHomeLayout
                             (you-at-center orbits + distant community galaxies; app/pitch only)
lib/why-mix.ts               Five-why listening mix; places people between their top two whys
lib/song-connections.ts, lib/connection-groups.ts, lib/read-state.ts  Song-star connections, grouped
                             connections list, unread state for Messages
lib/cover-art.ts             Album art lookup chain (Cover Art Archive → iTunes → Deezer)
lib/spotify/                 client.ts (OAuth + top tracks, SpotifyApiError), cookies.ts (httpOnly state/token cookies)
hooks/use-debounced-value.ts Debounce for typeahead (song search waits 350ms after typing stops)
lib/supabase/                server.ts (service role), serverAuth.ts (session), browser.ts (client),
                             proxy.ts (session refresh), config.ts (keys present?), vector.ts (parseVector)
lib/musicbrainz/             Song identity resolution (title/artist → canonical mbid)
lib/portrait.ts              Portrait + CardThread types (the portrait JSON and match-card threads)
lib/gemini/                  Song context + embedding, contrast cards, and the AI judgment calls:
                             json.ts (generateJson: enforced-JSON schema, thinking cap, Flash → Flash-Lite fallback,
                             and James's `hedgeAfterMs`: a slow Flash call races a Flash-Lite one),
                             generatePortrait.ts (listening portrait), assessConnection.ts (whole-profile
                             match judgment: rubric → computeScore, threads, card). evaluateAndGenerateCard.ts is
                             legacy (only scripts/test-gemini.ts and a shared type still use it)
lib/matching/                findMatches (match_picks → assessConnection, 3 at a time), portraits.ts (loadPublicPicks,
                             getPortraits, upsertPortrait), findWander (wander_picks), galaxyWindow,
                             galaxySongs, refreshPrimaryCluster, alignCardEvidence, cosineSimilarity, pickEmbedding
lib/cluster-assign.ts        Tags + valence/energy → one of the five legacy clusters (no LLM, no embeddings). TAG_WEIGHTS:
                             each feeling counts fully toward its own reason; the original tags keep their spread.
                             Still what writes profiles.primary_cluster (see "Topic clusters" below)
lib/matching/assignTopicCluster.ts, topicClusterVector.ts, hdbscan.ts  Daniel's topic clusters: nearest-centroid
                             assignment with a stability rule; mood-stripped average pick vector; HDBSCAN
lib/gemini/nameTopicCluster.ts  Names a new/drifted topic cluster from a sample of its members' picks
lib/listening/, tests/listening/, supabase/tests/  Daniel's listening import (adapters, worker, config) + its tests
                             (`npm test`, `npm run listening:sync`); docs/listening-discovery-implementation.md
lib/avatar.ts                James: the illustrated face options (profiles.avatar) + sanitizeFace; null = name-generated
lib/matching/rejectedPairs.ts  James: in-memory set of pairs the AI dropped (keyed by both pick counts), shared by
                             /api/match and /api/cards so a non-match answers instantly the second time
lib/supabase/missing-table.ts  isMissingTable(): lets code degrade to old behavior when a migration isn't applied
components/cluster-cache-provider.tsx  Primes lib/clusters.ts's cache from GET /api/clusters before the app renders
lib/clusters.ts              The five static cluster ids/labels/colors (CLUSTER_IDS) + a cache of the live topic clusters
lib/tags.ts                  FEELINGS (20 feeling tags, 4 per listening reason, each with a mood-circle spot),
                             LEGACY_TAGS (the original 10, still valid), sortFeelings(), isValidTag()
lib/emotion.ts               EMOTION_WEIGHT + clampEmotionValue
lib/safe-next.ts             safeNextPath(): the only allowed way to use an untrusted ?next= value
supabase/migrations/         The real schema, applied in order via the SQL Editor (see status)
supabase/seed.sql            Old fabricated-vector seed; superseded by scripts/seed-real-data.ts
scripts/seed-test-users.ts   Seeds ~100 fictional test users (tester-NNN@test.song-galaxy.local) through the real
                             pipeline; deterministic, idempotent. scripts/remove-test-users.ts deletes them all
scripts/seed-real-data.ts    Seeds demo personas through the real MusicBrainz + Gemini pipeline (password from
                             SEED_DEMO_PASSWORD; re-running also re-applies it to existing personas)
scripts/retag-demo-personas.ts  One-off (already run): personas' tags → hand-picked feelings per song
scripts/reassess-connections.ts  Re-assesses every candidate pair (after a scoring/judgment change); remembers
                             dropped pairs in scripts/.reassess-state.json (gitignored); --force redoes all
scripts/recompute-topic-clusters.ts  Daniel's batch job: HDBSCAN over everyone's picks → topic_clusters + membership,
                             Gemini names clusters. Not run yet (see status)
scripts/generate-portraits.ts  Backfills profile_portraits for every profile with public picks (--force redoes all)
scripts/recompute-pick-embeddings.ts  Rewrites every song_picks.embedding after an EMOTION_WEIGHT/formula change
scripts/backfill-cover-art.ts  Fills songs.album_art_url for catalog rows that predate cover-art lookup
scripts/test-gemini.ts       Standalone Gemini smoke test (no DB writes)
scripts/build-sim-embeddings.ts  Regenerates lib/sim/song-vectors.json for /sim
db/contract.md               Schema source of truth — read before touching any table or RPC
docs/plans/                  Saved feature plans (ai-portraits.md: done; swaps-bonds-stardust.md: see status)
MERGE_CHECKLIST.md           How the frontend gets wired to the real backend, method by method
AUTH_SETUP.md                Supabase Auth dashboard setup + auth file map
```

## How matching works (current design)
Users don't write essays. Per song they pick, they: drag one point on a circular valence/energy
control (how positive and how energetic that song makes them feel), then tap 1–3 **feelings**
from a shared list (`lib/tags.ts`). The feelings (safe, aching, defiant, weightless, homesick, …)
are grouped in five rows, one per listening reason, and once the dot is placed the rows and
feelings nearest to it come first (`sortFeelings`). A shared vocabulary is the point: two people
who both feel *homesick* in different songs connect on exactly that. Older picks may still carry
the original situation tags ("late night", "road trip", …); they stay valid everywhere.

**Song identity**, before anything else: a typed title/artist is resolved
via MusicBrainz into a canonical `{title, artist, mbid}`. If MusicBrainz
can't confidently resolve it (or is down), Gemini is used as a fallback.
Either way, once a song is identified it gets one shared mood/context
embedding (from Gemini, `{title, artist}` only), generated once per unique
song and reused by every user who picks it.

**Matching is per-pick, not per-profile.** Each pick (one user + one song +
their feelings + their valence/energy) gets its own 770-dim vector: the song's
768-dim embedding plus that pick's valence/energy (×`EMOTION_WEIGHT`)
appended. The song embedding is L2-normalized first and `EMOTION_WEIGHT` is 0.7, so the
song's meaning leads and mood is a deliberate minority share (the formula lives only in
`buildPickEmbedding`, `lib/matching/pickEmbedding.ts`). Nothing is averaged into a profile-level vector — averaging would
bury a strong specific match (e.g. one shared grief song) under someone's
unrelated other picks. `match_picks` finds the best pick pair per candidate
profile.

**AI does real judgment, not just narration.** Two parts:
- **Listening portrait** (`profile_portraits`, `lib/gemini/generatePortrait.ts`): Gemini reads
  a person's public picks (title, artist, the song's context summary, their feelings, mood, own
  words) into a headline, 3 highlights, 2–4 motivations (each with a cluster, confidence and
  evidence citing their real song titles), plus `seeks`/`tensions` used only server-side.
  Shown back to its owner on the reading/why/Me screens; owner-only RLS. Regenerated by
  `POST /api/portrait` when any pick changes (count or `picks_updated_at`).
- **Connection assessment** (`lib/gemini/assessConnection.ts`): pgvector `match_picks` is only
  the **pre-filter** (and its best pair a hint). Gemini then reads both whole profiles — both
  portraits and every public pick — and either confirms a match with 1–2 `threads` (each
  anchored by a real song on each side) plus a card, or drops the candidate.
  **The 0–100 `score` is computed in code, never asked for** (asked for a number, Gemini gave
  every match 85): Gemini answers three categorical judgments (`rubric`: specificity
  generic/specific/very_specific, evidence one_song_pair/several_songs/pattern_across_profiles,
  conversation little/some/a_lot), and `computeScore` adds a base, a second-thread bonus and how
  close the anchor songs sit on the mood circle. Under 35, or no thread whose songs really
  exist, is dropped. `GET /api/match` orders by `score` and the UI shows it as the match %.
  At most 5 new assessments per request, 3 at a time (a cold load takes ~4s); cached cards are
  reused; rejected pairs are remembered in memory until either person's pick count changes.
  Borderline pairs can flip between runs (model variance); clear matches and non-matches are
  stable. Cards are seen by both people, so they must never quote or paraphrase anyone's portrait.

**Clusters** are a grouping label for the galaxy, not a matching signal. **Two systems exist
during a transition (Daniel):**
- **Legacy `profiles.primary_cluster`** (one of five fixed ids): `lib/cluster-assign.ts` votes
  across a profile's picks (tags lead, the slider breaks ties). The galaxy RPCs (`galaxy_pool`,
  `galaxy_cluster_counts`), `galaxyWindow`, `findMatches` and `real-api` **still read this**.
- **Topic clusters** (`topic_clusters` table, `profiles.primary_topic_cluster_id`): discovered by
  HDBSCAN over people's picks (`scripts/recompute-topic-clusters.ts`), named by Gemini, any number
  of them. Seeded with the five legacy clusters; portraits name motivations from the live set.
- `refreshPrimaryCluster` (after every pick and lazily on galaxy load, **service-role** client)
  writes **both**: the topic assignment (nearest centroid; null until the recompute job has run)
  and, as a **transition bridge**, the legacy label. If `topic_clusters` is missing it falls back
  to the legacy label only (James's `isMissingTable` fallbacks, also in portraits and `/api/clusters`).
- The five seeded clusters now carry Daniel's labels (Quiet & Solitude, Motivation & Focus,
  Comfort & Longing, Escaping & Zoning Out, Nostalgia & Memories); in real mode labels come from
  `topic_clusters` via `/api/clusters`. A profile with no cluster yet shows under **"New"**
  (`unassigned`). `galaxyWindow` re-reads the anchor rows when any has a null `primary_cluster`,
  because a first galaxy load races the lazy cluster refresh (a new user used to land in "New").
- **Finishing the transition** (Daniel): move the galaxy RPCs and the readers above to
  `primary_topic_cluster_id`, then drop `primary_cluster` in a **new** migration and remove the
  bridge. Run the recompute job once so topic assignments exist.

**Wander** is the opposite question from matching: same song, far apart in
feeling (`wander_picks`: equal `song_id`, `(valence, energy)` distance ≥ 0.9).
Only on an explicit tap; Gemini writes a `kind: "contrast"` card or drops it.

**Galaxy window**: the front page draws a bounded neighborhood (you, top
matches, far stars, newcomers, a diversity-ranked near set), never everyone.
`galaxy_pool` / `galaxy_cluster_counts` feed it; loading it spends no LLM calls.
It's built from your picks, so **an account with no songs sees only its own star** (see Next up).

See `db/contract.md` for exact table shapes and every RPC.

## Auth
- Route handlers derive the acting user from the real Supabase session
  (`getCurrentProfileId()` in `lib/supabase/serverAuth.ts`), never from a
  `profileId` in the body or query string.
- Session client for anything acting "as the current user"; service-role
  client (`lib/supabase/server.ts`) only for backend operations that span
  users or write derived data: catalog lookups/inserts, the match/wander/galaxy
  RPCs, portraits, and `refreshPrimaryCluster` (the `authenticated` role may only update
  `profiles.display_name`, so a session-client write there is silently denied).
- **Google sign-in** (set up 2026-09-27; steps in `AUTH_SETUP.md`): a Google Cloud OAuth client
  (Web application) in the Google Cloud project "Song-Galaxy" (the same project as the Gemini key),
  redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`, JS origins = the Vercel URL and
  `http://localhost:3000`; the Client ID/secret live only in Supabase (Authentication → Providers →
  Google), never in `.env.local` or Vercel. **The Google app is in "Testing"**: only Google accounts
  on its Test users list can use "Continue with Google" (email signup works for everyone). Publishing
  it needs a homepage URL and a **privacy policy URL** on the Branding page (no privacy page yet).
  A Google login with the same email as an existing confirmed account links to it (Supabase's
  automatic identity linking). Before redirecting to Google, the form clears the browser's local
  session state, as email signup does.
- Sign-in is Supabase Auth end to end (`AUTH_SETUP.md`). `proxy.ts` refreshes
  the session cookie and redirects signed-out visitors from app screens to
  `/login`. With no `NEXT_PUBLIC_SUPABASE_*` keys, the proxy and auth UI step
  aside and the app runs on demo data locally; **on Vercel it returns 503 instead** (fails closed).
- **Any `?next=` redirect target goes through `safeNextPath()`** (`lib/safe-next.ts`).
  `"/\evil.com"` passes a naive `startsWith("/") && !startsWith("//")` check and
  resolves to `http://evil.com/` (browsers treat `\` as `/`). Found and fixed 2026-09-26.
  The callback, login page, auth form, `/auth/confirmed` and `lib/auth-handoff.ts` all use it.
- Email signup: the confirmation link carries `?via=email&next=…` to `/auth/callback`, which
  sends it to `/auth/confirmed` so the original tab can pick the session up. The link's origin
  is the page's own (`window.location.origin` in `components/auth/auth-form.tsx`), so signing up
  locally returns locally and on Vercel returns to Vercel. Supabase's Redirect URLs must allow
  those query strings — wildcards, not exact `/auth/callback` entries (see status).
- **Demo persona password** is not in the repo: it lives in `SEED_DEMO_PASSWORD` (`.env.local`,
  never committed, never in Vercel); ask a teammate. `song-galaxy-demo` no longer works.

## Hard rule: Spotify data can never touch the LLM
Spotify's Developer Policy prohibits (a) feeding Spotify Content into any
ML/AI model, and (b) analyzing Spotify content for any purpose, including
building user profiles. Practical rule for this codebase:

- Spotify's Web API is used **only** to fetch track title/artist/album art
  for display and to power the optional top-tracks import (currently not in the UI).
- Any Gemini call that touches a song may only receive plain
  `{ title, artist }` strings — never a raw Spotify API response object,
  and never fields like audio features, genres, or popularity.
- MusicBrainz, Deezer and iTunes are not Spotify data and carry no such restriction.
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
- **`main` is production.** Every push to `main` deploys to `https://song-galaxy-nu.vercel.app`
  within a couple of minutes. So: **apply a migration before pushing the code that needs it**
  (code first = the live site errors until the migration runs), build before merging, and do
  feature work on a branch (Vercel gives branches preview URLs). A bad deploy is undone in Vercel
  → Deployments → an earlier one → Promote to Production.
- Merging a teammate's branch: do it on a side branch, check with
  `git merge-tree --write-tree origin/main <branch>` first, and compare with a
  **three-dot** diff (`origin/main...branch`). A two-dot diff makes anything
  `main` gained after the branch point look like the branch deleted it. Only
  merge into `main` after `npx tsc --noEmit` and `npx next build` pass.
- **Anish's workflow:** new work goes on a branch; it reaches `main` only when Anish says "push".
  Right before that, `git fetch` and check what teammates pushed since, merge it into the branch,
  resolve conflicts (keep both sides when they do different things), and build **the merged
  result**. A teammate's push can break `main` on its own: `d388860` imported a deleted file and
  failed the build, so the next deploy would have failed until it was fixed.
- **Don't edit a migration that's already applied**: the change never reaches the database. Write
  a new migration instead (see `20260929010000_rename_topic_clusters.sql`).
- **Follow the app's theme** in UI work: gold `--primary`, the violet `oklch(0.66 0.11 300)`,
  frosted glass (`bg-background/60 backdrop-blur-xl`, hairline `border-white/10–15`), rounded-full
  pills, `ClusterStar` for cluster colors, and `DuoRing` + `useSlidingIndicator` for selection.
- Before stepping away from a good state, push a backup branch
  (e.g. `backup-main-20260926`).
- LLM calls run synchronously inside route handlers (no queue) — a
  hackathon-scale decision, not a scalability one.
- Connection Cards are cached in `connection_cards` — never regenerate one
  that already exists for a pair (either kind). After changing how cards are judged or scored:
  clear them in the SQL Editor, then `scripts/reassess-connections.ts` (see Getting started).
- Manual song entry must always work without Spotify.
- MusicBrainz is rate-limited to 1 request/second — resolve on submit, never
  per keystroke, and insert multiple picks **sequentially**.
- New structured Gemini calls go through `generateJson` (`lib/gemini/json.ts`). Never ask a model
  for a free-form number you'll rank by; ask categorical questions and compute the number.
- Scripts pace Gemini at ~1 call/second (paid tier). The free tier was 15/min and 500/day per
  model; a day of testing exhausted it once and broke new-song saves on the live site.
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
  To build without stopping someone's dev server, build a separate worktree:
  `git worktree add --detach /tmp/wt <branch>`, copy `.env.local`, clone `node_modules` with
  `cp -cR node_modules /tmp/wt/` (a symlink makes Turbopack panic), build there, then
  `git worktree remove --force /tmp/wt`.
- **Data modes** (`lib/data-source.ts`): with Supabase keys in `.env.local` the app is signed-in
  only and uses the **real** backend — anything you do in onboarding writes real rows, in the same
  database the live site uses. To try UI on demo data with no login, blank the keys for that run:
  `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev`.
  (`NEXT_PUBLIC_DATA_SOURCE=mock` also forces demo data, but login is still required.)

## Implementation status (2026-09-27)

### Deployment
- **Live on Vercel** at `https://song-galaxy-nu.vercel.app` (Hobby plan, project `song-galaxy`),
  deploying `main` automatically. Env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`,
  `MUSICBRAINZ_CONTACT_EMAIL` (mark the service-role and Gemini keys "sensitive"). Not in Vercel on purpose: `SEED_DEMO_PASSWORD`,
  `SPOTIFY_*`, `NEXT_PUBLIC_DATA_SOURCE`. `NEXT_PUBLIC_*` values are baked in at build time, so
  changing one needs a redeploy. The Supabase Vercel integration was deliberately **not** added
  (it could create a second database or overwrite the keys).
- Smoke-tested live 2026-09-26: pages load, app screens redirect to login when signed out, every
  API returns 401 signed out, and signed in as Maya: profile, search, portrait, matches, galaxy,
  song layer and messages all respond.
- **Supabase URL configuration**: Site URL = the Vercel URL. Redirect URLs include
  `https://song-galaxy-nu.vercel.app/**`, `http://localhost:3000/**` and `http://127.0.0.1:3000/**`
  (wildcards: confirmation links add `?via=email&next=…`). Local and live share one database.
- **Gemini billing is on** (paid tier). Expected cost is cents per user (~$0.02 per onboarding).
  A budget alert in Google Cloud is recommended.

### Live database (hosted Supabase project)
- Applied, in order: `20260926010000_song_galaxy_schema.sql`,
  `20260926020000_grant_service_role_backend_privileges.sql`,
  `20260927000000_profile_name_from_oauth.sql` (signup no longer fails on names
  over 80 chars), `20260927010000_galaxy_window.sql` (`primary_cluster`,
  `wander_picks`, `galaxy_pool`, `galaxy_cluster_counts`),
  `20260927020000_service_role_update_pick_embedding.sql` (lets the recompute script
  rewrite `song_picks.embedding`), `20260927030000_profile_portraits.sql` (portraits table,
  owner-only select, service-role write), `20260928000000_one_pick_per_song.sql` (James: unique
  `(profile_id, song_id)`, `updated_at`, service-role update/delete on picks,
  `profile_portraits.picks_updated_at`), `20260928010000_song_tags.sql` (**unused**: from the
  dropped AI-tags experiment; `song_tags` table + `song_picks.tag_whys` column, nothing reads them),
  and `20260929000000_topic_clusters.sql` (Daniel's; applied 2026-09-27 in an **additive** form:
  `topic_clusters` seeded with the five legacy clusters + `profiles.primary_topic_cluster_id`,
  backfilled; `primary_cluster` is **kept**. The original version dropped it, which would have broken
  the galaxy, and its backfill failed on a text→uuid cast; both fixed before applying),
  `20260929010000_rename_topic_clusters.sql` (the five seeded clusters → Daniel's new labels;
  needed because he'd edited the already-applied migration instead), and
  `20260930000000_profile_avatars.sql` (James: `profiles.avatar`, `profiles.avatar_url`, the public
  `avatars` bucket; saving an icon verified live).
- **Not applied on purpose:** `20261001000000_listening_foundations.sql` and
  `20261002000000_listening_import_operations.sql` (Daniel's listening import). The code is on
  `main` but off (`LISTENING_ENABLED` unset, so its settings UI is hidden and its routes return
  404; it also reads `DISCOVERY_ENABLED` and `LASTFM_API_KEY`, none of them set anywhere).
  Don't apply them or set the flag until Daniel says it's ready; then migrations first, flag last.
- **Accounts (2026-09-27):** all of the team's own accounts (Anish, Daniel, James, An/Bao/Jason
  and their `+alias` test accounts) and Marcella Yang's were deleted. Then **100 test users** were
  seeded. Now: **113 profiles** = 100 test users + the 6 demo personas + 3 outside testers
  (Alisha Agrawal, Nivedha, Vidipta Roy) + James's new account (no songs yet); 610 picks, 175
  catalog songs, 112 portraits. Since then teammates have signed up again (Anish, James,
  JSquared, Gon Wing, An's accounts), so counts have grown; query the database for current numbers.
- **Test users** (`scripts/seed-test-users.ts`, 2026-09-27): `tester-001` … `tester-100
  @test.song-galaxy.local`, fictional names ("Maren K."), password `SEED_DEMO_PASSWORD`. Each leans
  toward one or two listening reasons and picks 4–7 songs from a hand-built pool of ~100 well-known
  songs (each with a plausible mood spot and fitting feelings), with personal variation; testers
  001/002, 003/004 and 005/006 hold deliberate Wander pairs (Landslide, Mr. Brightside, Dreams).
  Galaxy groups came out 31 / 24 / 22 / 20 / 15. Every tester has a portrait; **match cards are not
  pre-generated** (they're assessed as people open Connections, 5 per load). A tester's galaxy
  shows ~112 stars and ~138 links. Remove them all with `scripts/remove-test-users.ts --apply`
  (only `@test.song-galaxy.local` accounts; catalog songs stay).
- Demo personas (from `scripts/seed-real-data.ts`): Maya, Theo, Jordan, Amara, Noor, Sam
  (`<name>@song-galaxy.local`, password in `SEED_DEMO_PASSWORD`), 27 picks resolved through real
  MusicBrainz + Gemini, including a deliberate wander pair (Sam and Noor both picked
  "Landslide", opposite feelings). **Their tags are hand-picked feelings per song**
  (`scripts/retag-demo-personas.ts`, 2026-09-26); each has a `primary_cluster` and a portrait.
  Maya has only 1 song. Real accounts exist too (team, testers); their older picks keep the
  original tags until they edit them.
- All 27 seeded pick embeddings were recomputed with the balanced formula (`b5f84e3`).
- **Connection cards were all re-assessed** with the rubric scoring and the new feelings on
  2026-09-27 (91 pairs → 50 matches, scores 45–82); the account cleanup then removed every card
  involving a deleted account, leaving 18. Plus the Sam/Noor contrast card.

### Backend
Every route above is implemented against the v2 schema with session auth.
Verified end to end against the live DB, signed in through the real `@supabase/ssr` cookie flow:
`GET /api/match`, `GET /api/cards/:id` (cache hit), `POST /api/wander` (Sam → Noor on
"Landslide", `kind: "contrast"`), `GET /api/galaxy` (bounded window + hidden counts),
`POST /api/messages` + two-way chat (Maya ↔ Theo), `GET /api/profile`, `POST /api/picks` with
real feelings/mood (stored vector = unit-length song part + mood × 0.7), `GET /api/songs/search`
+ `/api/songs/preview`; signed-out calls return 401. RPCs `wander_picks`, `galaxy_pool`,
`galaxy_cluster_counts` return correct rows; signup with a 120-char name is truncated to 80.

- **Matching balance — fixed** (`b5f84e3`): the song part is normalized and `EMOTION_WEIGHT` is
  0.7 (was 5, which made cosine ~95% slider position).
- **AI portraits + whole-profile assessment — merged and verified** (`ai-portraits`): owner-only
  RLS checked with a real login; the Flash → Lite fallback fires live on 503s.
- **Rubric scoring** (`a7f775a`): on 8 real pairs, scores spread 45–85 with a correct drop
  (workout music vs. quiet late nights), where the old free number was 85 for everything.
- **Speed** (`88a5f60`): `gemini-flash-latest` started "thinking" by default (500+ tokens), which
  made each assessment 5–18s; capping thinking at 1024 brought it to 1–3s with the same verdicts.
  With 3 assessments in parallel, a cold Connections load went from ~21s to ~4s.
- **Latency pass** (James, `9850f56`): `getClaims()` instead of `getUser()` for session checks;
  `POST /api/picks` runs song context and cover art in parallel and refreshes the cluster after the
  response (`after()`); an in-memory MusicBrainz cache (24h) with a queued 1 req/s throttle; a 10s
  shared galaxy candidate pool; short client read caches in `lib/http-db.ts` (profiles 30s, cards
  60s, song layer 30s), cleared on pick changes, card generation and sign-out.
- **Google sign-in — live and verified** (`9cd451b`): locally, "Continue with Google" → Google →
  back into the app; a new account lands on the pick screen.
- **Topic-cluster incident (2026-09-27):** Daniel's topic-cluster code reached `main` (so
  production) before its migration was applied: every new user's portrait failed ("Could not find
  the table public.topic_clusters") and new users got no galaxy group. Fixed by applying the
  migration in an additive form plus the bridge (`d66d3e2`); James shipped `isMissingTable`
  fallbacks for the same bug at the same time and both were merged. Verified live: a new user gets
  a portrait, a galaxy group, and a full galaxy.

### Frontend
- **Real-data mode is live** (Daniel, `0a615ce`): whenever Supabase keys are set,
  `lib/api.ts` uses `httpDb` (`lib/http-db.ts`) and `lib/real-api.ts` instead of the mock
  world. Profile, picks, matches (with cached cards), cards, wander, galaxy (+ hop and the
  song layer), and messages (send + polled reads) all hit the real routes. With no keys, or
  `NEXT_PUBLIC_DATA_SOURCE=mock`, it's the demo data. `mockDb` still implements the v2 `Db`.
- **Onboarding is pick-your-own only** (`spotify-integration`): everyone goes straight to the
  pick screen and searches the real catalog (Deezer, iTunes fallback; top 20, duplicates across
  albums shown once) for 5–10 songs. In mock mode it's still the 24-song demo catalog. Search
  results are display candidates only: MusicBrainz resolves each song once, when it's saved.
  The song-swap composer uses the same search.
- **Song previews** (`cee5be6`): a play button beside each search result plays the song's 30s
  clip; one at a time, stops on leaving the screen, re-fetches a stale link once. Not yet on
  saved songs (profiles, galaxy); `/api/songs/preview?title=&artist=` already supports that.
- **Feeling tags** (`e3e7336`): the feel step, galaxy "+" and Profile's edit sheet show the mood
  circle first, then the 20 feelings in five labeled rows, re-sorted by the dot. Older picks'
  tags appear under "From before" and can be kept or removed.
- **Onboarding flow**: pick → **feel** → reading → why → reveal. `chooseSongs` stores the songs
  (session only); `saveSongs` saves each described song sequentially while the reading screen
  plays, and the reading screen waits for it, with a retry that skips songs already saved.
- **Real portrait in real mode**: `analyzeMusic` waits for `saveSongs`, then `POST /api/portrait`
  (mapped to `AnalysisResult`, song titles → the user's real pick ids) and warms `/api/match` in
  the background. The Me page loads the stored portrait (`GET /api/portrait`) when this browser's
  session has none. Mock mode still uses `lib/inference.ts`. Clicked through in a browser.
- **Connections** show the AI `score` as the match %, and cards map `card_json.threads` to 1–2
  shared motivations with real songs on each side (older cards fall back to `shared_why`).
- **Songs are managed, not appended** (James, `song-tag-management`): Profile → tap a song to
  change how it feels or remove it; "Add or change songs" re-runs the picker, which marks songs
  you already have ("Yours"), needs only 1 song once you have some, and pre-fills the feel step.
- **Star sheet shows songs** (`2c30568`, `app/(tabs)/galaxy/page.tsx` `StarPreview`/`TheirSongs`):
  tapping a star used to wait forever on a "listening moment" that only the demo data has. In real
  mode it now lists that person's first 4 songs with preview buttons and links to their profile
  (`/people/[id]`, which already listed songs).
- **Galaxy "you" fix** (James, `lib/matching/galaxyWindow.ts`): the center always gets its node,
  and your edges go to your top 12 by similarity, so new users no longer show zero connections.
- **Spotify import is out of the UI.** Bao's `An/dev` connect route was merged and hardened
  (random one-time OAuth state, token in a 1h httpOnly cookie scoped to `/api/spotify`, the old
  `/api/spotify/auth` that trusted a `?profileId=` deleted) and the round trip worked, but a
  Spotify app in development mode only admits hand-added accounts (5 new per 24h, no
  collaborators; extended quota needs an established business). Later commits on `An/dev`
  (a Spotify-backed search, committed conflict markers) were not merged: superseded.
- **Laptop layout + navigation** (Anish, `b4659fb`…`17ea554`): at `lg` the app fills the window
  (`PhoneFrame`). The galaxy is the centerpiece: its header fades into the stars (clicks pass
  through except on controls), "Closest to you" is a 420px frosted card in the bottom-left, and
  the round frosted buttons (+ tinted gold) sit on the same line as the nav capsule. The tab bar
  and the People/Songs switch share `useSlidingIndicator` (a glide with a small squish) and
  `DuoRing`. Phones keep the docked bar, now frosted. Non-galaxy pages get `lg:pb-24` so the
  capsule never covers content; bottom sheets are capped at 640px.
- **Full-screen landing** (`8911030`, `abd9221`): the starfield spans the window on laptops, with
  no logo in the corner; Daniel then reworked its slots and animations (`7626946`).
- **Galaxy build-out intro** (`435047d`…`6e83d56`): the first galaxy view per browser session
  (`sessionStorage` key `song-galaxy-built-out`), you appear first, stars ripple outward by
  distance over ~3s (`BUILD_SPAN` in `components/galaxy/galaxy-scene.tsx`), and lines grow star to
  star like a web (the edge shader's `aFrom`/`aGrow`/`uTime`). `/galaxy?intro` replays it every
  load. 3D scene only (reduced motion or no WebGL gets the SVG galaxy, which has no intro).
- **Cluster stars** (`6c82376`): a matte `ClusterStar` replaced every cluster color dot (Messages,
  Connections, Profile, chat, filters, song sheets).
- **Shared-feelings badge** (`4de07f2`): a linked person with no songs or artists in common used
  to show "0 songs · 0 artists"; the badge now falls back to the top 3 feelings you both use
  (`GalaxyEdge.sharedFeelings`, `sharedFeelings()` in `lib/real-api.ts`).
- **Cluster HUD** (Daniel, `c8780d4`): the cluster chips became one glass capsule with a popover.
- **Profile icons** (James, `bddef1c`; Daniel's customizer `d388860`): an illustrated face you can
  customize, or an uploaded photo. James also made cards faster (Gemini hedging, remembered drops).
- **Onboarding** (An, merged `7321471`): finished users can't restart first-time onboarding (the
  gate), the mood circle drags smoothly, and the picker opens on a list before you type. Anish
  added the community list ("Popular on Song Galaxy") ahead of the charts, and kept search results
  on screen while a new query loads (`keepPreviousData`).
- Motivation feedback (confirm/reject/private) on the why/Me screens is still session-only.
- Album art is populated (Cover Art Archive → iTunes → Deezer, or a Spotify `i.scdn.co` URL).

### Tried and dropped (don't redo without a new reason)
- **AI-written tags per song** (branch `song-tags`): Gemini wrote 5–6 short tags per song, stored
  per normalized title + artist. Accurate but, per Anish, not how people actually express what a
  song means to them; and song-specific tags can't connect people who picked different songs.
- **"It feels like…" picture postcards** (branch `postcards`): a shared deck of 30 metaphor cards
  with Gemini ranking the best 8 per song. Dropped because drawn artwork isn't obtainable from
  Unsplash's API: its illustrations are Unsplash+ (paid), and search returns photos (checked
  `asset_type`). Unsplash's API terms would also require always-visible artist attribution and a
  published privacy policy. The deck/picker code is on the branch if revisited with other art.
- Both branches are on GitHub as backups, unmerged.

### Plan status
- **Phases A–D — done** (merge + v2 contract, migrations + seed, onboarding feel step,
  real-data mode), plus the matching balance fix and the galaxy "+" fix.
- **AI portraits + whole-profile assessment — done** (`docs/plans/ai-portraits.md`).
- **Deployment — done** (Vercel, fail-closed proxy, seed password out of the repo).
- **Google OAuth — done** (Google only; the app is still in Google's "Testing" mode).
- **Laptop layout, navigation redesign, galaxy intro — done** (2026-09-27).
- **`docs/plans/swaps-bonds-stardust.md`**: 1. previews — done; 2. song-specific tags — replaced
  by feeling tags; 3. real swaps + bonds — **on hold** (Anish, 2026-09-27); 4. Stardust —
  **stretch** (backburner).

### Next up (in order)
1. **Real song swaps + bonds — on hold until Anish picks it back up.** A `song_swaps` table
   (sender, recipient, catalog song, note, the swap it answers) written by the chat's swap screen
   and "swap back". **The chat must let you preview/play a swapped song** (reuse
   `PreviewButton`). Bond levels in one config; the galaxy link between two people gets brighter
   as the bond grows. Replaces today's browser-only "bonded" celebration. **Open question:** does
   the bond count every swap, or only completed exchanges (A swaps, B swaps back)? Ask before
   building.
2. **Publish the Google app** so anyone can use Google sign-in: write a plain-language **privacy
   policy** page (`/privacy`: what's stored, what goes to Gemini, hosting, deletion), then on the
   Google Auth Platform's Branding page add the homepage URL, the privacy URL and the authorized
   domain `song-galaxy-nu.vercel.app`, and click Publish app (basic scopes: no review).
3. **Finish the topic-cluster transition** (Daniel): run `scripts/recompute-topic-clusters.ts`
   once, move the legacy `primary_cluster` readers over, drop the column in a new migration,
   remove the bridge in `refreshPrimaryCluster`.
   Also Daniel's: the **listening-history import**; when he says it's ready, apply its two
   migrations, then set the env vars in Vercel and redeploy.
4. Smaller, when there's room: show people in the galaxy for **accounts with no songs** yet (with
   an "add your songs" prompt); previews on saved songs; consider making Vercel's production
   branch `production` so pushes to `main` stop going live immediately.

## Known gotchas (read before touching the relevant code)
- **Pushing to `main` deploys to production.** See "Working conventions": migrations first. It has
  already bitten once (the topic-cluster incident above).
- **Write migrations so they can be applied before the code AND with the old code still live**:
  additive first (new tables/columns), destructive later (drops) in a separate migration once
  nothing reads the old shape. Test casts: a `case` of text literals into a `uuid` column needs
  `::uuid` (Postgres doesn't coerce it like it does in an `insert … values`).
- **A git commit object once vanished right after a merge** (2026-09-27): the branch pointed at a
  commit git reported as a "bad object". Recovery: `git update-ref refs/heads/<branch> <last good>`,
  `git reset --hard`, `git reflog expire --stale-fix --expire=never --all`, `git fsck`, redo the
  merge, and push it right away. Cause unknown (possibly a background git cleanup from an editor).
- **Spotify only redirects to `127.0.0.1`, never `localhost`**, and the Next dev server blocks
  its scripts for any host but `localhost` (blank pages) unless it's in `allowedDevOrigins`
  (`next.config.ts` lists `127.0.0.1`). Cookies don't carry between the two hosts, so anything
  Spotify must start and end on `127.0.0.1:3000`. Next dev also reports `localhost` in `req.url`
  whatever the browser used: build Spotify redirects from `SPOTIFY_REDIRECT_URI`'s origin.
- **Signing up with an email that already has a confirmed account shows success but sends no
  email** (Supabase hides which emails exist). Log in instead, or test with a Gmail `+alias`.
  The default Supabase email sender is also limited to a few emails per hour.
- **A stale login in the browser** (after switching accounts or a long-idle tab) can make the
  galaxy look empty or wrong; signing out and back in fixes it. Not yet reproduced on purpose.
- **Deezer preview links expire ~15 minutes** after the search that returned them; never store
  them. The preview button re-fetches through `/api/songs/preview` once when a link fails. On
  iPhones, that retry may be blocked by autoplay rules (the first play works).
- **iTunes search ranks covers above originals** for one-word titles ("holocene" → covers
  first); Deezer ranks by popularity, which is why it's the primary search source.
- **Gemini model names go stale fast.** `gemini-2.5-flash` was retired for new
  callers mid-hackathon (live 404). Use a `-latest` alias, never a pinned
  version, in `lib/gemini/client.ts`.
- **`gemini-flash-latest` returns 503 (high demand) often, and now "thinks" by default.**
  `generateJson` caps thinking (`THINKING_BUDGET`) and falls back to Flash-Lite on
  429/500/503/404. Use it for any new structured Gemini call instead of hand-parsing JSON.
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
- **`song_picks` is unique per `(profile_id, song_id)`** (James's migration): re-picking updates.
- **The service role can DELETE only `song_picks`.** Other cleanup (cards, auth users' data,
  `song_tags`) goes through the SQL Editor. `auth.admin.deleteUser` still works for test accounts
  and cascades.
- **Next 16 type helpers**: bare `npx tsc --noEmit` reports `PageProps` /
  `LayoutProps` as missing because they're generated by `next dev`/`next build`/
  `next typegen`. Not real errors; `npx next build` is the check that counts.
- **`AGENTS.md` / the "This is NOT the Next.js you know" block is legitimate**
  Next 16 tooling (`node_modules/next/dist/server/lib/generate-agent-files.js`),
  not a prompt injection. It was wrongly flagged as one early on. Read the
  bundled docs in `node_modules/next/dist/docs/` before writing Next code.
- **CSS masks can vanish on composited layers in Chrome** (over the galaxy's WebGL canvas, or
  mid-animation): a gradient ring cut out with `mask-composite` filled the whole nav pill. Draw
  outlines as SVG strokes (`DuoRing`) instead.
- **ResizeObserver reports once right after `observe()`.** Reacting to that first report as a
  resize snapped the sliding highlight instead of gliding it; `useSlidingIndicator` ignores it.
  Measure positions inside bordered containers relative to the padding box (subtract
  `clientLeft`/`clientTop`), or the highlight sits 1px off.
- **Duplicate SVG ids break gradients**: two copies of an inline SVG (e.g. a phone and a laptop
  version, one `display:none`) must use different `id`s: `url(#id)` resolves to the first match in
  the document, and a gradient inside a hidden SVG doesn't render, so the visible copy loses its fills.
- **Editing files from Python:** `open(p, "w").write(open(p).read()…)` truncates the file before
  it's read and leaves it empty (it wiped `galaxy-scene.tsx` once; restored from git). Read into a
  variable first, then write.
- **HMR can show a half-updated page** (e.g. text missing after an edit to the landing page).
  Reload before assuming the change broke something.
- **`next.config.ts` changes need a dev-server restart** (e.g. `devIndicators: false`, which hides
  the "N" badge in dev only).
- **zsh eats `:l`/`:h`/`:t` after a variable**: `git show $B:lib/x.ts` becomes
  `origin/branchib/x.ts`. Quote it: `git show "${B}:lib/x.ts"`.
- **`/pitch`'s galaxy intentionally doesn't look like the real `/galaxy`.** The real page always
  uses `arrangement="whys"` (`computeLayout`, clustering by why you listen). `/pitch` passes
  `arrangement="home"` (`computeHomeLayout`), a different visual model built only for its
  egocentric story: you fixed at the center, connections on relationship-based orbit rings,
  community galaxies scattered at the edge. If `/pitch` looks visually inconsistent with the app,
  that's this, not a bug — check `computeHomeLayout` before "fixing" it to match `computeLayout`.

## Backburner (known work, deliberately deferred)
Roughly in priority order. None of these are in the active plan ("Next up" is).

1. **Song identity normalization.** MusicBrainz nondeterminism and title
   canonicalization (see gotchas) mean two users picking the same song can get
   separate `songs` rows. That silently breaks catalog dedup (duplicate Gemini
   calls) and **Wander**, which matches on exact `song_id`. More pressing now that real
   search brings in many more songs. Proposed fix: a normalized identity key (accents,
   punctuation and parentheticals stripped; title + artist) with a unique index, checked
   alongside `mbid` before inserting, then backfill/merge existing duplicates. `songKey()` on the
   `song-tags` branch (`lib/song-key.ts`) and the seed's `looseTitle()` are starting points.
2. **Stardust (stretch).** A currency earned when both people swap (a completed exchange),
   written server-side to a ledger, with anti-farming rules as config (daily caps per pair and
   per person, cooldown, no reward for re-swapping a song), spent on customizing your own star
   (a store frame: items, owned, equipped). Depends on real swaps + bonds; a teammate is designing
   the star customizations. Scratched from the active plan 2026-09-27.
3. **Show the AI's judgment in the galaxy** (parked 2026-09-27, "maybe later, not 100% sure").
   Today the galaxy is vector math only; the AI-confirmed matches and their cards live only in
   Connections. Idea: mark AI-confirmed links differently in the galaxy, and show the card's
   `shared_why` in the star sheet (from cached cards only, never a new Gemini call on galaxy load).
4. **Demo personas polish:** Maya (the main demo persona) still has only 1 song. The galaxy is no
   longer sparse (100 test users), but those are bulk testers; hand-written personas read better
   in a demo.
5. **Realtime messages.** Chat polls `GET /api/messages` today; switch to a
   Supabase Realtime subscription (publication is already enabled on `messages`).
6. **Repo reorganization** (lib/ and components/ into folders): only after the UI redesign lands,
   in one mechanical commit during a short freeze, so teammates' branches don't conflict.
7. **Database hygiene.** Drop the unused `song_tags` table and `song_picks.tag_whys`.
8. **`why` page motivation feedback.** Motivations are real (the portrait), but
   confirm/reject/private feedback is session-only and doesn't reach the portrait or matching.
9. **Remaining contract mismatches** (`lib/types.ts` header, `MERGE_CHECKLIST.md`):
   song id space vs catalog slugs (#1), richer card structure than `card_json`
   has (#7), no conversations/analysis storage (#10, #11; avatars are stored now).
10. **Scale.** Resolve MusicBrainz in the background instead of blocking the
   pick request; revisit synchronous LLM calls in route handlers; the in-memory caches (search
   results, rejected pairs) are per server instance on Vercel.
11. **Spotify leftovers.** The `/api/spotify/*` routes and `lib/spotify/` are unreachable; keep
    for a public-playlist-link import (client credentials, no user login; test one call first,
    Spotify-owned playlists may be blocked) or delete.
12. **Small cleanups.** `scripts/test-gemini.ts` uses tags that aren't in
    `lib/tags.ts`; the `primary_cluster` check constraint in the migration
    duplicates `CLUSTER_IDS` and must be kept in sync by hand;
    `supabase/seed.sql` still has the old fabricated-vector data.
13. **Continuous learning / outcome-based tuning.** Nothing in the real system
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
- **In-run learning is simulated** against a hidden random rule. It is not backburner #13.

## Getting started
```bash
npm install
cp .env.local.example .env.local   # Supabase + Gemini + MUSICBRAINZ_CONTACT_EMAIL (+ SEED_DEMO_PASSWORD for scripts)
npm run dev
```
With the Supabase keys set, the app requires sign-in and uses the **real** backend
(onboarding writes real rows, shared with the live site). To try UI on demo data with no sign-in:
```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run dev
```

Demo logins: `maya@song-galaxy.local`, `theo@song-galaxy.local`, `jordan@…`, `amara@…`,
`noor@…`, `sam@…`, and the test users `tester-001@test.song-galaxy.local` … `tester-100@…`;
password = `SEED_DEMO_PASSWORD` for all (ask a teammate; it's not in the repo).

Scripts (all read `.env.local`):
```bash
# Seed demo personas through the real pipeline (safe to re-run; also re-applies SEED_DEMO_PASSWORD)
node --env-file=.env.local node_modules/.bin/tsx scripts/seed-real-data.ts
# ~100 fictional test users (idempotent; ~10 min the first time), and removing them all again
node --env-file=.env.local node_modules/.bin/tsx scripts/seed-test-users.ts        # --count=N for a different size
node --env-file=.env.local node_modules/.bin/tsx scripts/remove-test-users.ts      # dry run; add --apply to delete
# Portraits for every profile with songs (skips up-to-date ones; --force regenerates all)
node --env-file=.env.local node_modules/.bin/tsx scripts/generate-portraits.ts
# Re-assess every candidate pair after changing judgment/scoring. First clear old cards in the SQL Editor:
#   delete from public.connection_cards where card_json->>'kind' is distinct from 'contrast';
node --env-file=.env.local node_modules/.bin/tsx scripts/reassess-connections.ts   # --force ignores remembered drops
```
