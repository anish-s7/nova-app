# Merge checklist: wiring the frontend to the real backend

**Rewritten 2026-09-26 against `main` @ `26a33b3`.** The previous version of this file
was written against `ba262ec`, before the backend's tag/slider/MusicBrainz redesign —
`POST /api/songs`, a `motivations` table, and camelCase-only match results no longer
exist. If you started implementing against the old version, stop and re-read this one;
several method names and shapes changed, not just internals.

All frontend data access goes through `lib/api.ts`. No page, component, or hook imports
`lib/mock-world.ts` or `lib/mock-db.ts`. When the backend lands, the work below happens
**inside `lib/api.ts`** unless a line says otherwise.

How the seam is built:

- `lib/types.ts` → "DB contract rows" section: `ProfileRow`, `SongRow`, `SongPickRow`,
  `PickInsert`, `ConnectionCardRow`/`ConnectionCardJson`, `MessageRow`, `MessageInsert`,
  `ConfirmedMatchRow`, plus the `Db` interface. These match `db/contract.md`, the
  migration, and `lib/supabase/types.ts` on main.
- `lib/mock-db.ts` → `mockDb: Db`, the mock world served as contract rows.
- `lib/api.ts` → `const db: Db = mockDb;` is the **swap point**. The exported functions map rows to
  view types (`songFromRow`, `messageFromRow`, `cardFromRow`). Anything the contract can't supply
  is tagged `NOT IN CONTRACT`.
- The comment block at the top of `lib/types.ts` lists every shape mismatch (#1–#13 below refer to it).

**Before Step 1 will work at all:** every "me"-scoped route on main (`POST /api/profile`,
`POST /api/picks`, `GET /api/match`, `GET`/`POST /api/cards/:id`, `POST /api/messages`)
derives the acting user from a real Supabase Auth session — there is no `profileId` you
can pass in a body or query string anymore. This app has no auth yet (mismatch #12).
**You need a real (even if minimal) Supabase Auth session before any real route call
will succeed**, not just before `ME_ID` gets a real value. Signing in as one of the two
demo users from `supabase/seed.sql` (`maya@song-galaxy.local` / `theo@song-galaxy.local`,
password `song-galaxy-demo`) via Supabase Auth's email/password sign-in is the fastest
path to a working session for testing.

---

## Step 1: implement `Db` against main's routes (7 methods), then flip the swap line

Add `const httpDb: Db = { ... }` in `lib/api.ts` and change `const db: Db = mockDb;` to `httpDb`.

| `Db` method | Backend on main | Notes |
|---|---|---|
| `getProfile(id)` | `GET /api/profile?id=` → `{ profile, picks }` | Response shape changed: `picks` is a top-level key now, not nested under `profile`. Server already filters private picks unless you're viewing your own profile — no client-side filtering needed. |
| `listPicks(id)` | same route, `picks` | Each pick is `{ id, tags, valence, energy, reason_text, is_public, songs: { title, artist, album_art_url } }` — note the nested key is `songs` (matches the DB relation name), not `song`. |
| `insertPick(pick)` | `POST /api/picks`, body = `PickInsert` → `{ song, pick }` | **One call per song, no batch endpoint.** Requires `tags` (1-3 items) and `valence`/`energy` — see mismatch #3, this is the real blocker, not just a mapping exercise. `reasonText` is optional now; sending `""` is fine but no longer required. The route calls MusicBrainz (rate-limited, ~1 req/sec) then possibly Gemini — see mismatch #13 for the latency implication on a multi-song import. |
| `getMatches(limit?)` | `GET /api/match?limit=` → `{ matches }` | **No `profileId` param — session-derived.** Each entry is `ConfirmedMatchRow = { profileId, displayName, card }`. There is no raw similarity score; every returned match has already passed the AI evidence-check and has a full card attached. This likely changes how `getConnections()` should work — see mismatch #6. |
| `getConnectionCard(otherId)` | `GET /api/cards/:otherId` → `{ status: "match" \| "not_found", card, cached }` | **No `profileId` param — session-derived.** Only reads the cache; never generates. Returns `card: null` with `status: "not_found"` if nothing's cached yet — that's normal, not an error. |
| `generateConnectionCard(otherId)` | `POST /api/cards/:otherId` (empty body) → `{ status: "match" \| "insufficient_evidence", card, cached? }` | New method, doesn't exist in the old `Db`. Generates on demand — e.g. for a profile the match list didn't already surface a card for. `insufficient_evidence` is a real, expected outcome (not an error): the AI judged the overlap too thin to show. Handle it in the UI (e.g. "no strong connection found yet"), don't throw. |
| `listMessages(me, other?)` | **No read route.** Comment in main's `app/api/messages/route.ts` says reads go client-side via Supabase Realtime | Same as before: blocked until this app has a real authenticated browser Supabase client (mismatch #12). |
| `insertMessage(input)` | `POST /api/messages`, body `{ otherProfileId, text }` → `{ message }` | **Shape changed**: no more `userA`/`userB`/`senderId` in the body — `senderId` is derived from the session, and the route computes the ordered pair itself. `MessageInsert` in `lib/types.ts` reflects this. |

After this step, song saves, profiles, picks, match list (with cards!), on-demand card
generation, and text messages are real — **once mismatch #3 and #12 are resolved**, since
those two block every route from being callable at all, not just from returning the
shape this app expects.

## Step 2: function bodies in `lib/api.ts` that change

Signatures stay the same in every case. "Enrichment" means the `NOT IN CONTRACT` lines.

1. **`delay()` / `maybeFail()`**: delete the calls in every function (mock latency and `?fail=` injection).
2. **`songFromRow`**: now maps from `SongPickRow & { song: SongRow }`, not a flat `SongRow` with `profile_id`/`reason_text`. `albumArtUrl` can come from `song.album_art_url` if a caller ever populates it (mismatch #2), otherwise still undefined.
3. **`getMe`**: `motivations` and `cluster` come from `myMotivations()`. Needs #4 resolved, and #3's product decision, since there's no longer a natural place to derive "motivations" from song_picks the way the old `motivations` table's `label` column made possible.
4. **`getUser`**: same as `getMe`; the edge can now be partly rebuilt from `getMatches()`'s cards instead of a separate `matchProfiles` similarity call, but still needs #4/#5 for cluster/motivations.
5. **`getConnections`**: this function's whole shape may want to change now that `getMatches()` already returns cards, not just candidates to fetch cards for separately. Decide whether `Connection` (the view type) should carry a card preview instead of `sharedMotivation`/overlap counts derived from mock data.
6. **`getConnectionCard`**: swap for `db.getConnectionCard` (cache read) falling back to `db.generateConnectionCard` (on-demand generate) — the old single mock call now maps to two real methods. Handle `insufficient_evidence` explicitly (#7 also still applies: the `extra` argument's enrichment fields).
7. **`getConversations` / `getConversation`**: `cluster` is enrichment (#5, #10). `mockSwaps()` merges song swaps. Delete it or back it with a table (#9).
8. **`sendMessage`**: build `{ otherProfileId, text }` instead of the old `{ user_a, user_b, sender_id, body }` — `pair()` is no longer needed here since the route computes it.
9. **`sendSongSwap`**: mock-only (#9). No table.
10. **`getGalaxy`**: fully mock (#5, #6). Needs an all-pairs RPC or a precomputed `connections` table, though `getMatches()` narrows what "all-pairs" even needs to cover for the current user's own edges.
11. **`getArrival`**: mock realtime. Contract realtime only publishes `messages`, so there's no "profile joined" event.
12. **`importSpotify` / `searchSongs` / `analyzeMusic`**: not DB. Point at the Spotify and Gemini routes when the UI adopts them. `analyzeMusic`'s whole premise (infer motivations after the fact) is in tension with #3 — see that item before changing this function.
13. **`updateMotivation`**: nothing to write to (#4).
14. **`resetWorld`**: mock-only. Make it a no-op.

## Things that can't be done inside `lib/api.ts` (need a decision)

- **#3 is the real blocker, not a mapping problem.** `POST /api/picks` requires `tags`
  (1-3, fixed taxonomy) and `valence`/`energy` (a circular slider position). Neither
  exists anywhere in this app's onboarding flow today. See the three options laid out in
  `lib/types.ts`'s comment block. This needs a real UI/product decision before Step 1's
  `insertPick` can be implemented for real, not a code change.
- **#12: this app needs a real Supabase Auth session**, not just a real `ME_ID` string.
  Every "me"-scoped route (profile write, picks, match, cards, messages) 401s without one.
  The demo users in `supabase/seed.sql` are the fastest path to testing this before a real
  sign-up/sign-in flow exists.
- **Save latency, worse than before (#13).** MusicBrainz is rate-limited to ~1 req/sec, on
  top of the existing Gemini-call latency concern for new songs. `saveSongs` awaiting a
  24-song import before navigating will now take significantly longer; a pending/progress
  UI state is worth doing before wiring this up, not after.
- **`hooks/use-galaxy-realtime.ts`** calls `getArrival()` synchronously on a timer. A real
  subscription means changing that hook (or moving the subscription into `api.ts` as
  `subscribeArrivals(cb)`), and needs #12 (a real session) first anyway.
- **#8 is fixed, no action needed** — noting it here since the old checklist called it out
  as a thing to fix on the backend; it's already done (`lib/matching/alignCardEvidence.ts`
  on main), so don't budget time for it.
- **Step 1 unlocks immediately for** profile reads/writes and text messages, *once* #12
  (auth) exists. Picks, match list, and cards are additionally blocked on #3 (the
  tags/valence/energy product decision) until that's resolved.
