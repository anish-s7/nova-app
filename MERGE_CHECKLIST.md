# Merge checklist: wiring the frontend to the real backend

All frontend data access goes through `lib/api.ts`. No page, component, or hook imports
`lib/mock-world.ts` or `lib/mock-db.ts`. When the backend PR (`main`) lands, the work
below happens **inside `lib/api.ts`** unless a line says otherwise.

How the seam is built:

- `lib/types.ts` → "DB contract rows" section: `ProfileRow`, `SongRow`, `MotivationRow`,
  `ConnectionCardRow`/`ConnectionCardJson`, `MessageRow`, `MatchProfileRow`, plus the `Db` interface.
  These match `db/contract.md`, the migration, and `lib/supabase/types.ts` on main.
- `lib/mock-db.ts` → `mockDb: Db`, the mock world served as contract rows.
- `lib/api.ts` → `const db: Db = mockDb;` is the **swap point**. The exported functions map rows to
  view types (`songFromRow`, `messageFromRow`, `cardFromRow`). Anything the contract can't supply
  is tagged `NOT IN CONTRACT`.
- The comment block at the top of `lib/types.ts` lists every shape mismatch (#1–#12 below refer to it).

---

## Step 1: implement `Db` against main's routes (7 methods), then flip the swap line

Add `const httpDb: Db = { ... }` in `lib/api.ts` and change `const db: Db = mockDb;` to `httpDb`.

| `Db` method | Backend on main | Notes |
|---|---|---|
| `getProfile(id)` | `GET /api/profile?id=` → `{ profile }` | Response includes `songs(*)`, so drop that key. |
| `listSongs(profileId)` | same route, `profile.songs` | The route uses the service-role key, so it returns private songs too. Filter `is_public` for other users. |
| `insertSongs(rows)` | `POST /api/songs` once per row, body `{ profileId, title, artist, reasonText, spotifyTrackId, isPublic }` → `{ song }` | The route runs Gemini extraction + embedding inline, so 24 Spotify songs means 24 slow calls. Consider batching or `Promise.all`. Rejects empty `reasonText` (see below). |
| `matchProfiles(target, n)` | `GET /api/match?profileId=&limit=` → `{ matches }` | Route returns **camelCase** `{profileId, displayName, similarity}`; map back to `MatchProfileRow`. |
| `getConnectionCard(me, other)` | `GET /api/cards/:other?profileId=me` → `{ card \| null }`; if null, `POST` same URL with `{ profileId }` | Route returns only `card_json`. Build `user_a/user_b` with `pair()`. `id`/`created_at` aren't read by `cardFromRow`. **See #8 before trusting `evidence.user_a`.** |
| `listMessages(me, other?)` | **No read route.** main's comment says reads go client-side via Supabase | RLS only grants `authenticated`, so this is blocked on auth. Either add `GET /api/messages` or a browser Supabase client after auth exists. |
| `insertMessage(row)` | `POST /api/messages` `{ userA, userB, senderId, text }` → `{ message }` | Returns a `MessageRow` as-is. |

After this step, song saves, profiles, songs, match list, card text, and text messages are real.

## Step 2: function bodies in `lib/api.ts` that change

Signatures stay the same in every case. "Enrichment" means the `NOT IN CONTRACT` lines.

1. **`delay()` / `maybeFail()`**: delete the calls in every function (mock latency and `?fail=` injection).
2. **`songFromRow`**: `albumArtUrl` comes from the mock catalog. Replace with a Spotify art lookup, or leave it undefined so tiles fall back to the icon (#2).
3. **`getMe`**: `motivations` and `cluster` come from `myMotivations()`. Needs #4/#5 resolved.
4. **`getUser`**: `motivations`, `cluster`, and `edge` come from `lookupUser`/`edgeBetween`. The edge can be rebuilt from `matchProfiles` similarity; the rest needs #4/#5.
5. **`getConnections`**: `cluster`, `sharedMotivation`, `sharedSongs`, `sharedArtists` are enrichment. Needs #1 (for overlap counts) and #5.
6. **`getConnectionCard`**: the `extra` argument to `cardFromRow` (overlap, evidence `Song`s, second shared reason, difference evidence) is enrichment (#7). Decide whether to extend `card_json` or drop those UI bits.
7. **`getConversations` / `getConversation`**: `cluster` is enrichment (#5, #10). `mockSwaps()` merges song swaps. Delete it or back it with a table (#9).
8. **`sendMessage`**: done after step 1; nothing else to change.
9. **`sendSongSwap`**: mock-only (#9). No table.
10. **`getGalaxy`**: fully mock (#5, #6). Needs an all-pairs RPC or a precomputed `connections` table.
11. **`getArrival`**: mock realtime. Contract realtime only publishes `messages`, so there's no "profile joined" event.
12. **`importSpotify` / `searchSongs` / `analyzeMusic`**: not DB. Point at the Spotify and Gemini routes when the UI adopts them.
13. **`updateMotivation`**: nothing to write to (#4).
14. **`resetWorld`**: mock-only. Make it a no-op.

## Wander (same song, different feeling)

Mock-backed today; the real pieces already exist server-side.

- Backend: `POST /api/wander` (`lib/matching/findWander.ts`, `lib/gemini/evaluateContrast.ts`), needs the `wander_picks` RPC from `db/contract.md` applied.
- `Db.wander(profileId)` → implement as `POST /api/wander`; map `{ wanders: [{ profileId, displayName, card }] }` to `WanderRow` (build the `ConnectionCardRow` with `pair()`, `kind: "contrast"` in `card_json`).
- `getContrastCard` reads the cached row via `db.getConnectionCard`; `GET /api/cards/:id` already returns cached contrast cards, so the UI must not assume `kind` is absent. `cardFromRow` (match cards) should not be fed a `kind: "contrast"` row.
- `songFromShared` resolves `shared_song` by title + artist against the mock catalog. Same identity gap as mismatch #1.
- Mock `getWander` sleeps 1.8s to stand in for Gemini. Delete that with the other `delay()` calls.

## Bounded galaxy (`getGalaxy({ limit })`, `getGalaxyMore`)

Mock-backed today (`lib/galaxy-sample.ts` over the mock world). Real pieces: `GET /api/galaxy`, `GET /api/galaxy/more`
(`lib/matching/galaxyWindow.ts`), and `db/galaxy_window.sql`.

- `profiles.primary_cluster` is now written (`lib/cluster-assign.ts`, on each pick and on galaxy load), so mismatch #5 is resolved for the galaxy path. The migration still has to add the column. `Connection.cluster`/`User.cluster` can read it too.
- Map `GalaxyWindow` to `GalaxyResponse`: `topMotivations: []` (NOT IN CONTRACT), `isMe` from `meId`, add `far`, and put `me` first in `nodes`. `hidden` and `sampled` pass through as-is.
- Map `GalaxyMoreWindow` to `GalaxyMore.arrivals`: one `{ node, edges }` per node, edges touching that node.
- Wire `?limit` only for demos; the real default is 200.

## Things that can't be done inside `lib/api.ts` (need a decision)

- **Per-song "why" text.** Both onboarding pages save through `api.saveSongs()`, but it sends
  `reason_text: ""` because onboarding never asks for one, and `POST /api/songs` rejects empty reasons (#3).
  Either onboarding collects a reason per song (a UI change) or the backend accepts empty/synthesized ones.
- **Save latency.** `saveSongs` is awaited before navigating to the reading screen, and the continue
  buttons have no pending state. With real Gemini calls, that wait will be noticeable.
- **`ME_ID`** is the string `"me"`. Callers import it from `lib/api.ts`, so only the re-export has to
  change, but its value must come from auth/session (#12).
- **`hooks/use-galaxy-realtime.ts`** calls `getArrival()` synchronously on a timer. A real subscription
  means changing that hook (or moving the subscription into `api.ts` as `subscribeArrivals(cb)`).
- **#8 on main**: `generateConnectionCard(current, other)` writes `evidence.user_a` = requester, but the
  row stores `user_a` = smaller id. Fix it on the backend (swap before upsert) so `cardFromRow` is correct.
- **Step 1 unlocks immediately for** profile names, song lists, match ranking/similarity, card text and
  openers, and text messages. Everything else above is blocked on the listed mismatches.
