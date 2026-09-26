> Saved 2026-09-26. Status: **done and merged to `main`** (2026-09-26, `89fee8a`). Migration
> `20260927030000` applied; portraits generated for all 7 profiles with picks; RLS verified
> owner-only; `/api/match` returns AI scores + threads (6.2s cold, 0.17s cached). Old match cards
> without scores stay until deleted in the SQL Editor (cards are never regenerated).

# AI portraits + whole-profile connection assessment (branch `ai-portraits`), plus docket ordering

## Context
The user wants the LLM to have a meaningful role rather than being a wrapper. Today Gemini
(1) writes a one-line mood summary + embedding per song, and (2) at the end of matching judges **one
pick pair** (the single closest pair from pgvector) and writes the card. It never sees a person as a
whole, and the math alone decides who reaches it. Also, in real-data mode the onboarding "Here's what I
heard" analysis (`analyzeMusic` in `lib/api.ts`) is still **mock inference** — no real branch exists.

Outcome: Gemini (a) reads each person's whole profile into a **listening portrait**, shown back to them
on the why / me screens, and (b) **assesses connections from both portraits + both sets of songs**,
deciding who's a real connection, how strong (a justified score that sets the order), and why — citing
multiple songs. pgvector stays as a cheap pre-filter only. Per-pick matching (CLAUDE.md) is preserved:
portraits inform the AI's judgment; nothing is averaged into a profile vector.

Work happens on a new branch **`ai-portraits`** (from `main` after the pre-work below), pushed to origin
at the end; merging to `main` is a separate decision after the user reviews it.

## Execution order
0. **Save this plan durably**: copy it to `docs/plans/ai-portraits.md` in the repo (commit + push to
   `main`), and add a project memory pointing to it ("AI portraits plan is next after the pre-work").
   This scratch plan file gets overwritten by later planning sessions.
1. Pre-work tasks below (galaxy "+" fix → verify real-data mode → demo prep), on `main`.
2. Only then: create branch `ai-portraits` and implement the feature; push the branch; merge to `main`
   only on the user's approval.
3. After: `MERGE_CHECKLIST.md` + CLAUDE.md (on request).

## Docket ordering (decided)
**Before the feature, on `main`:**
1. **Galaxy "+" add-a-song gets `TagPicker` + `MoodCircle`** (`components/galaxy/add-song-sheet.tsx`,
   `addSong` in `lib/api.ts`), replacing `tags: ["comfort"], valence 0, energy 0`. Portraits read
   tags/mood, so placeholder picks would feed false data straight into the AI. Small; message Daniel
   first (his component).
2. **Verify real-data mode end to end** (signup → feel step → `song_picks` rows; Maya ↔ Theo chat in two
   browsers; connections show cards). Establishes a working baseline so anything that breaks after the
   AI change is clearly attributable.
3. **Demo prep**: user deletes the verification test message; confirms the `localhost:3000/**`
   redirect wildcard. **CLAUDE.md**: mark the matching-balance fix done (user asks for CLAUDE.md edits).

**After the feature:** update `MERGE_CHECKLIST.md` (the feature changes the connections/why flows) and
a CLAUDE.md update on request.

## Feature design

### 1. Schema — migration `supabase/migrations/20260927030000_profile_portraits.sql`
New table `public.profile_portraits` (not a column on `profiles`: every signed-in user can read every
`profiles` column):
- `profile_id uuid pk references profiles(id) on delete cascade`, `portrait jsonb not null`,
  `pick_count int not null`, `model text not null`, `updated_at timestamptz default now()`.
- RLS on; policy: owner can `select` their own row (`profile_id = auth.uid()`); no other authenticated
  access. `grant select, insert, update on public.profile_portraits to service_role`. Follow the
  existing migration pattern (`begin/commit`, `public.` qualified).
- Document in `db/contract.md`.

### 2. Portrait generation — `lib/gemini/generatePortrait.ts`
- Input: the profile's **public** picks only (so a portrait used in others' assessments can't leak
  private picks): song title/artist, `songs.context_summary`, tags, valence/energy, optional reason.
- Gemini `gemini-flash-lite-latest` with `config: { responseMimeType: "application/json", responseSchema }`
  (enforced JSON instead of the current fence-stripping `JSON.parse`).
- Output shape maps directly onto the existing `AnalysisResult` so the UI needs no redesign:
  `{ headline, highlights: string[3], motivations: [{ label, description, cluster (one of
  lib/clusters.ts CLUSTER_IDS), confidence 0..1, evidence: [{ text, songTitles: string[] }] }],
  seeks: string /* what kind of person they'd connect with */, tensions?: string }`.
- Prompt rules: speak from the person's own picks only, no diagnosis/clinical language, handle grief /
  heartbreak reasons gently, never invent songs. Compliance: plain title/artist strings only (Spotify rule).
- `lib/matching/portraits.ts`: `upsertPortrait(profileId)` (service-role client: load public picks +
  songs, generate, upsert) and `getPortraits(profileIds)` (batch read).

### 3. Routes
- `POST /api/portrait` — session user only (`getCurrentProfileId()`); regenerates and returns their portrait.
  `GET /api/portrait` — returns the stored one (or 404).
- Called by the client after onboarding's `saveSongs` finishes and after galaxy `addSong`; the seed
  script calls `upsertPortrait` per persona. One Gemini call per profile change (not per pick).
- `scripts/generate-portraits.ts` backfills every profile with picks (paced for the 15/min free tier).

### 4. Whole-profile assessment — `lib/gemini/assessConnection.ts`
- Replaces `evaluateAndGenerateCard` in `lib/matching/findMatches.ts` and the direct-pair path in
  `app/api/cards/[matchId]/route.ts`.
- Input: both portraits (if a candidate has none yet, fall back to picks-only), the viewer's picks and
  the candidate's **public** picks (songs, tags, mood, context summaries), plus the best pick pair from
  pgvector as a hint.
- Enforced JSON: `{ status: "match" | "insufficient_evidence", score: 0..100, rationale,
  card: { shared_why, evidence: { user_a, user_b }, difference, openers[], suggested_swap_prompt,
  threads: [{ why, song_a, song_b, evidence_a, evidence_b }] (1–2) } }`. `threads` and `score` are extra
  `card_json` keys (the jsonb shape constraint only requires the existing five), so no schema change.
  Keep `alignCardEvidence` — extend it to swap `threads[*].song_a/b` and `evidence_a/b` too.
- `findMatches`: `match_picks` retrieves up to 10 candidates; the AI assesses at most the top **5
  uncached** per request (rate limit), cached cards reused as today; results **sorted by AI score**
  (fallback: similarity for legacy cards without one). Drop `insufficient_evidence` as today.

### 5. Frontend (real mode only; mock mode unchanged)
- `analyzeMusic` in `lib/api.ts`: in `REAL_DATA`, wait until `session.saveStatus === "saved"`, then
  `POST /api/portrait`, map to `AnalysisResult` (song titles → song ids from the session's songs;
  motivations get `feedback: "unreviewed", isPublic: true`). `components/reading-sequence.tsx` already
  waits on save and on analysis, so the flow holds.
- After onboarding, prefetch `/api/match` once (fire-and-forget) so assessments are cached before the
  user opens Connections.
- `lib/real-api.ts`: `getConnections` uses `card.score / 100` for `similarity` when present (the ring then
  shows the AI's judgment); `getConnectionCard` maps `threads` → `sharedMotivations` with real songs
  (resolves `song_a/song_b` titles against each side's picks), falling back to today's single
  `shared_why` for legacy cards. `getMe` / `me` page: if the session has no analysis, load
  `GET /api/portrait`.
- `addSong` (after pre-work #1): call `POST /api/portrait` after the pick saves.

### Out of scope
Persisting confirm/reject feedback on portrait motivations (stays session-only); Realtime; background
job queue; showing other people's portraits directly (only through cards).

## Critical files
New: `supabase/migrations/20260927030000_profile_portraits.sql`, `lib/gemini/generatePortrait.ts`,
`lib/gemini/assessConnection.ts`, `lib/matching/portraits.ts`, `app/api/portrait/route.ts`,
`scripts/generate-portraits.ts`.
Changed: `lib/matching/findMatches.ts`, `app/api/cards/[matchId]/route.ts`,
`lib/matching/alignCardEvidence.ts`, `lib/api.ts` (`analyzeMusic`, `addSong`), `lib/real-api.ts`,
`lib/supabase/types.ts`, `scripts/seed-real-data.ts`, `db/contract.md`.
Reuse: `createServerClient`, `getCurrentProfileId`, `parseVector`, `getGeminiClient` /
`GEMINI_TEXT_MODEL`, `alignCardEvidence`, `CLUSTER_IDS`, the existing `connection_cards` cache.
Not touched: `/sim`, the pgvector RPCs, `lib/matching/pickEmbedding.ts`.

## Verification
- `npx tsc --noEmit`, `npx next build`.
- Apply the migration (user, SQL Editor); run `scripts/generate-portraits.ts`; confirm one row per seeded
  persona and that an authenticated user can read only their own portrait (REST as Maya → Theo's row not visible).
- Real sessions (the `@supabase/ssr` cookie method used before): `POST /api/portrait` as a fresh user;
  `GET /api/match` as Maya → results carry `score` and `threads` citing multiple songs, ordered by score;
  the second call makes no Gemini calls (cached); `insufficient_evidence` candidates dropped.
- Browser (user): sign up → feel step → reading → why page shows the AI portrait (headline, highlights,
  motivations referencing their actual songs) → Connections ordered by AI score, card shows 1–2 threads.
- Mock mode (keys blanked) still works unchanged.
- Push branch `ai-portraits`; do not merge to `main` until the user approves.
