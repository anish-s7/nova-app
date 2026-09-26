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

## Step 1: implement `Db` against main's routes (6 methods), then flip the swap line

Add `const httpDb: Db = { ... }` in `lib/api.ts` and change `const db: Db = mockDb;` to `httpDb`.

| `Db` method | Backend on main | Notes |
|---|---|---|
| `getProfile(id)` | `GET /api/profile?id=` → `{ profile }` | Response includes `songs(*)`, so drop that key. |
| `listSongs(profileId)` | same route, `profile.songs` | The route uses the service-role key, so it returns private songs too. Filter `is_public` for other users. |
| `matchProfiles(target, n)` | `GET /api/match?profileId=&limit=` → `{ matches }` | Route returns **camelCase** `{profileId, displayName, similarity}`; map back to `MatchProfileRow`. |
| `getConnectionCard(me, other)` | `GET /api/cards/:other?profileId=me` → `{ card \| null }`; if null, `POST` same URL with `{ profileId }` | Route returns only `card_json`. Build `user_a/user_b` with `pair()`. `id`/`created_at` aren't read by `cardFromRow`. **See #8 before trusting `evidence.user_a`.** |
| `listMessages(me, other?)` | **No read route.** main's comment says reads go client-side via Supabase | RLS only grants `authenticated`, so this is blocked on auth. Either add `GET /api/messages` or a browser Supabase client after auth exists. |
| `insertMessage(row)` | `POST /api/messages` `{ userA, userB, senderId, text }` → `{ message }` | Returns a `MessageRow` as-is. |

After this step, profiles, songs, match list, card text, and text messages are real.

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

## Things that can't be done inside `lib/api.ts` (need a decision)

- **Song picks never reach the seam.** `app/onboarding/pick/page.tsx` and `app/onboarding/music/page.tsx`
  write songs straight into the mock session (`setSession`). A real `POST /api/songs` needs an
  `api.saveSongs()` call from those pages, and it also needs a non-empty `reason_text` per song, which
  onboarding doesn't collect (#3).
- **`ME_ID`** is the string `"me"`. Callers import it from `lib/api.ts`, so only the re-export has to
  change, but its value must come from auth/session (#12).
- **`hooks/use-galaxy-realtime.ts`** calls `getArrival()` synchronously on a timer. A real subscription
  means changing that hook (or moving the subscription into `api.ts` as `subscribeArrivals(cb)`).
- **#8 on main**: `generateConnectionCard(current, other)` writes `evidence.user_a` = requester, but the
  row stores `user_a` = smaller id. Fix it on the backend (swap before upsert) so `cardFromRow` is correct.
- **Step 1 unlocks immediately for** profile names, song lists, match ranking/similarity, card text and
  openers, and text messages. Everything else above is blocked on the listed mismatches.
