# Listening, evolving taste, and music discovery

Status: slices 1–4 implemented locally; migrations not applied to hosted data and
no live provider account was connected during automated verification.
Prepared 2026-09-27 against the current checkout. Baseline `npx tsc --noEmit` passes.

Slice 1 implementation (2026-09-27): added dependency-free adapter contracts,
conservative identity/idempotency helpers, a typed worker repository boundary,
synthetic fixtures, and migration `20261001000000_listening_foundations.sql` with
private owner-scoped ingestion tables plus service-role lease/commit RPCs. Unit tests
cover cursor validation, identity replay, real repeats, documented same-second
collapse, version identity, and repository fencing arguments. A disposable local
Supabase run applied the full migration chain and passed SQL integration checks for
RLS, mutation grants, owner constraints, replay deduplication, lease recovery, and
generation fencing. The migration remains local-only and was not applied to hosted
data.

Slice 2 implementation (2026-09-27): added bounded Last.fm and ListenBrainz
adapters, shared provider pacing, a resumable CLI/short `after()` worker, atomic
connection/reconfiguration/disconnect operations, authenticated private routes,
and Profile source settings that also render before a portrait exists. Fixture
tests cover upstream error payloads, now-playing exclusion, fixed ranges,
exclusive ListenBrainz pagination and same-second boundary recovery, worker
interruption/retry, and disconnect generation fencing. Both feature flags still
default disabled. Hosted migrations, provider credentials, scheduler setup, and
the one-consenting-account-per-provider rollout gate remain operations work.

Slice 3 implementation (2026-09-27): added timezone-aware daily aggregate rebuilds,
immutable atomic taste snapshots, pure recent/core scoring, artist-led interests,
and a private summary route/Profile view. Selected-source dirty dates advance the
input revision; rebuild and publication recheck revision, primary connection,
generation, and active sync state. Tests cover repeat caps, elapsed-time decay,
artist dominance and smaller-interest retention, short-history labels, weekly
windows, IANA DST boundaries, primary-source switching, and preservation of the
previous snapshot after a fenced publication. Snapshot computation contains no LLM
calls and remains separate from authored pick meanings.

Slice 4 implementation (2026-09-27): added a bounded public-pick catalog RPC,
versioned private discovery batches, deterministic ranking/diversification, typed
evidence with serve-time public-visibility revalidation, and private save/feedback
state. The real song sheet now offers close/explore recommendations with factual
reasons, preview/outbound access, Save, Dismiss, and a separate Add meaning action.
Retrieval is capped at 300 paths and publication at 24 songs; per-person and
per-artist caps prevent a single neighbor or artist from filling the result. Tests
cover smaller-interest representation, artist diversity, feedback suppression,
private-pick exclusion, bounded retrieval, ownership, atomic publication, evidence
wording, and the invariant that a discovery save never creates a `song_picks` row.
Flags still default disabled and the migration remains local-only.

## Outcome and first release

Connect Last.fm, ListenBrainz, or both; collect timestamped listens; maintain several interests at different timescales; discover unfamiliar songs through evidence-backed paths; update a stable galaxy as those interests change.

First release: both public-history connectors, a user-selected primary source, private recent/baseline statistics, recommendations from existing public picks, factual explanations, and explicit save/dismiss feedback. Neither imported listens nor recommendation saves become emotional song picks automatically. Full source merging, external recommendation feeds, and public listening profiles follow later.

Keep the current emotional matching, connection cards, manual picks, and mock mode working. No new LLM calls in ingestion, taste calculation, or galaxy requests. Implementation begins with local fixtures and migrations; deployment and provider eligibility are separate rollout checks.

## Findings in the current code

- `lib/matching/galaxyWindow.ts`: bounded people retrieval through `galaxy_pool`, `wander_picks`, and the diversity sampler; 10-second in-process cache; legacy cluster readers remain. Hop authorization checks membership in the candidate pool, despite the comment describing the visible window. New discovery links must not assume arbitrary people are authorized hop targets.
- `lib/matching/galaxySongs.ts`: song candidates are limited to public picks within the people window. Uses the service role and explicitly filters private picks. The song endpoint currently has no hop-center parameter.
- `lib/song-connections.ts`: imports `lib/sim/song-vectors.json` and is called by `components/galaxy/song-sheet.tsx`. Real discovery must get its own server result; do not extend simulation imports into production.
- `lib/gemini/generateSongContext.ts`: embeddings are of title/artist text, not audio. Do not label this evidence as acoustic similarity.
- `lib/matching/topicClusterVector.ts`: one average over mood-stripped pick vectors, specifically for topic placement. It is not an appropriate replacement for a multi-interest listening profile.
- `app/api/picks/route.ts`: requires feelings/tags and runs catalog enrichment. It is not an ingestion endpoint.
- `songs.resolution_source` only allows `musicbrainz` or `gemini_fallback`; imported unresolved tracks need a separate identity store, not a misleading new catalog row.
- `lib/musicbrainz/client.ts`: throttling/cache are process-local; calling it for every event across workers would exceed the intended aggregate request pace. Its search score is not calibrated identity confidence.
- `lib/matching/findMatches.ts`: persistent connection cards are never regenerated. Keep evolving music recommendations separate from these historical relationship cards.
- `lib/galaxy-layout.ts`: the full graph affects the layout seed and cluster-count-dependent anchors. Rebuilding for each sync can move many existing stars.
- `components/galaxy/galaxy-canvas.tsx`: songs are placed after people, which is useful for additive discovery; currently song placement expects listener/cluster anchors.
- `lib/real-api.ts`: 30-second song cache; `lib/api.ts` switches real/mock implementations. New data needs explicit real adapters and versioned SWR keys, not a change to session picks.
- `app/(tabs)/me/page.tsx`: add connection settings outside the `session.analysis` branch so accounts with no portrait can connect.

Read local Next.js guides before implementation: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `03-api-reference/04-functions/after.md`. Route params are awaited; personal responses stay dynamic/private. `after()` shares platform duration limits and is not a durable queue.

## Decisions to implement

1. Public username imports are explicitly unverified, private sources. They do not confer identity or public social credibility. No provider passwords or user tokens for initial read-only imports.
2. Store both source histories but select one for active taste calculations. Switching primary invalidates derived state; never silently fall back to the other source.
3. Initial history is bounded to 90 days where available. Shorter history is valid, not an error. Coverage records describe what we retrieved, not proof that every real listen was recorded.
4. Maintain manual meaning, observed listening, and recommendation feedback as separate evidence types.
5. Start with song/artist affinity and public pick overlap. Do not invent genre, audio features, moods, or life circumstances from titles.
6. Derive new results in the background; publish complete snapshots atomically. Preserve the previous usable snapshot during retries.
7. Feature flags: `LISTENING_ENABLED` and `DISCOVERY_ENABLED`, server-side. Authenticated capabilities response controls UI visibility. Public sharing remains off in this release.

## Data model and access

Use additive, sequential Supabase migrations with names later than the latest existing migration, regardless of the current calendar date. Update `lib/supabase/types.ts` and `db/contract.md` with each implemented slice. Do not modify `CLAUDE.md` as a side effect.

### Ingestion migration

- `listening_connections`: UUID, profile FK, provider enum, canonical username, verification state, status, connection generation, consent version/time, last successful query, latest observed listen, next due time, safe error code. Unique `(profile_id, provider)`. Changing username resets that source generation and schedules removal/rebuild of its old data.
- `listening_preferences`: profile PK, primary connection FK, IANA timezone, exploration setting, input revision, active taste snapshot FK (added after snapshot table). Validate primary connection belongs to the profile using a constraint/RPC, not just UI logic.
- `listening_tracks`: minimal title, full artist credit, version/album hints, normalized identity fingerprint, nullable catalog song FK, identity status. No automatic AI enrichment.
- `listening_track_aliases`: provider namespace + identifier/fingerprint, track FK, resolution method, provenance. Recording MBIDs and ListenBrainz MSIDs are different identifier types. Keep credited artist identity separate from display spelling.
- `listening_events`: profile, connection, connection generation, track FK, UTC timestamp, idempotency fingerprint, source metadata needed for reconciliation, excluded flag. Index `(profile_id, played_at desc)` and `(connection_id, played_at desc)`; enforce same-owner connection references. Do not retain entire provider payloads by default.
- `listening_sync_jobs`: connection/generation, state, kind (backfill/incremental/reconcile), fixed range, provider-specific continuation JSON, lease token/expiry, attempt count, next attempt, bounded progress counters. Partial unique index allows one active sync per connection; serialize with delete/reconfigure operations.
- `listening_daily_tracks`: profile, source connection, track, local date, play count, distinct observed timestamps, aggregation revision. Unique date/track/source key. Rebuild affected dates idempotently rather than incrementing totals on every retry. Retain enough event history to rebuild the selected windows; initial retention default 120 days, exposed in consent.

Use owner-only RLS SELECT for personal tables, and explicitly revoke anonymous access. Sensitive mutations and derived writes go through authenticated server routes and restricted worker RPCs. Raw events and aliases must not become a globally readable catalog. Job internals are service-role-only; return sanitized progress through an owner-scoped route. Security-definer RPCs require fixed search paths, explicit grants, and ownership checks where callable by users.

### Taste/discovery migration

- `taste_snapshots`: profile, input revision, algorithm version, primary-source generation, computed-as-of, timezone, coverage, counts, state. Snapshot UUID is a cache key, not a public identity.
- `taste_interests`: snapshot, stable interest key, seed artists/tracks, recent/core weights, confidence/evidence coverage, representative songs. JSONB is sufficient initially; no vector index without a validated representation.
- `discovery_batches`: profile, taste snapshot, public-catalog revision/expiry, feedback revision, exploration mode, algorithm version, created/expires times.
- `discovery_candidates`: batch, catalog song, rank, pool type, interest key, component scores, structured evidence, source attribution. Unique song per batch. Only retain bounded batches per user.
- `discovery_events`: profile, candidate/batch, action, server timestamp, client idempotency key. Validate candidate ownership. Deduplicate impressions per exposure/session and sanitize client metrics.
- `discovery_saves`: profile/catalog-song unique pair; separate from `song_picks`. Adding meaning invokes the existing explicit pick flow later.

Every publication checks input revision and source generation still match. A primary-source switch or disconnect increments revision first, making an in-flight computation ineligible for publication.

## Provider and worker contract

New modules:

```text
lib/listening/types.ts, config.ts, identity.ts, repository.ts
lib/listening/providers/lastfm.ts, listenbrainz.ts
lib/listening/sync.ts, aggregate.ts, worker.ts
scripts/sync-listening.ts
```

Adapter operations: validate username; fetch a bounded page with fixed lower/upper timestamps and continuation; normalize records; classify retryable/permanent errors. Result includes events, continuation, completion, and provider pacing hints. Use injected fetch and clock for tests. No adapter writes the database.

Last.fm: query `user.getRecentTracks` with `from`, `to`, page, and the server API key. Exclude now-playing entries without timestamps. Handle API error objects even when HTTP is 200. Freeze the upper bound during pagination to avoid new plays moving page offsets. Reconcile recent ranges for late additions/edits.

ListenBrainz: use bounded listens queries. `min_ts` and `max_ts` cannot be supplied together; page backwards from a fixed upper bound, applying the lower bound locally. Account for exclusive boundaries and multiple records at the same second. Refetch boundary groups, deduplicate, and mark an incomplete range if a full timestamp group cannot be recovered within provider limits. Use the export API for any future complete-account import.

Same-source idempotency: prefer a documented stable event ID when present; otherwise hash connection generation, timestamp, and conservative track identity. Identical same-second records can be indistinguishable: document collapsing them rather than claiming lossless playback history. Different timestamps remain separate listens.

Worker sequence:

1. Atomically claim a due job via a restricted Postgres RPC using a row lock/lease; establish fixed bounds.
2. Fetch one bounded page outside the transaction with timeout and provider-wide pacing.
3. Transactionally upsert events and advance page checkpoint, provided lease token and generation still match.
4. Continue until a page/time budget is reached, then persist continuation and release/requeue.
5. Mark a range complete only after all its pages commit. Rebuild affected daily aggregates and enqueue/mark taste recomputation dirty.
6. Publish a snapshot only after all its intended inputs are consistent; overlapping hourly and backfill work must not create partial summaries labeled complete.

Use 429/Retry-After and rate-limit headers where available, bounded exponential backoff with jitter, and shared provider pacing across workers. A process-local limiter is insufficient. Recheck an overlapping recent window (initially 48 hours) and periodically reconcile a wider bounded range. Only reconcile deletions after successful complete range retrieval; an empty/error page must never erase history.

Manual sync returns 202 and job ID; an optional short `after()` worker kick may improve latency but the scheduler/CLI must resume it independently. Initial worker budget: at most 5 provider pages or 15 seconds per invocation, tunable against actual deployment duration limits. Backfill progresses across jobs and prioritizes the newest week.

Scheduling: keep execution host-independent through the CLI and protected cron route. Vercel Hobby cron is daily, not hourly; hosting plan is unverified. Start local with the CLI. Enable an hourly-capable scheduler only after deployment capability is confirmed; display actual cadence. Do not deploy a queue that lacks a functioning consumer.

Disconnect semantics: increment generation, disable/cancel jobs, remove source events and source-derived aggregates, invalidate personal recommendations/snapshots, and clear primary selection if necessary. Recheck generation before any in-flight writes. Preserve separately authored picks/saves. Shared aliases lose personal provenance; delete unreferenced private identities according to retention policy.

## Taste calculation

New modules: `lib/taste/score.ts`, `interests.ts`, `snapshots.ts`, `types.ts`.

Compute daily capped contribution `log1p(min(play_count, 5))`, then decay it by `2 ** (-age_days / half_life)`. Initial experimental half-lives: 7 days for recent affinity and 60 for core affinity. Normalize song and artist distributions separately, cap artist dominance, retain distinct-day evidence, and store algorithm version. No learned model is required.

Keep rolling seven-day summaries separate from decayed affinities. Compare the last 7 days against the previous 7, and recent affinity against the longer baseline; denominator changes and partial coverage must be visible. Snapshot recomputation runs on elapsed time even with no new plays. Zero new plays with a successful sync means inactivity; stale sync means missing evidence. Do not erase core taste merely because ingestion failed.

Version 1 interests: artist-led groups with exact recording overlap as stronger evidence. Persist stable keys from reliable artist IDs or conservative normalized credits. Avoid arbitrary genre names. Artist-based recommendations can work before cross-artist clustering exists.

Version 2 interests: combine artist groups using public-pick co-occurrence or an approved external related-artist graph. Use a deterministic bounded graph algorithm, cap the number of visible interests, retain isolated groups, and align new groups to previous seed sets by weighted overlap. Only merge when evidence is strong; reserve representation for smaller interests. Labels start from representative artist names; no invented mood inference. Sparse evidence falls back to artist groups.

Keep the explicit pick/meaning representation separate throughout. Do not append fabricated mood coordinates to imported tracks or mix distributions into existing 770-dimensional pick vectors.

## Discovery retrieval and ranking

New modules: `lib/discovery/candidates.ts`, `rank.ts`, `diversify.ts`, `evidence.ts`, `feedback.ts`, `types.ts`.

First candidate sources are existing public picks globally, not only the current 200-person window:

1. Other public picks from people who share a reliably resolved anchor song.
2. Other catalog songs by artists appearing in one of the user's interests.
3. Songs from public-pick overlap neighborhoods for each interest, with per-person contribution caps.
4. Rediscovery from the user's earlier listening, kept in a distinct pool and labeled accordingly.

Use indexed joins in a bounded RPC and batch-load evidence. Retrieve at most 300 candidates initially; expose at most 24 recommendations. Low inventory returns fewer candidates without duplicates or fabricated explanations. Unknown imported recordings remain usable for statistics even if no catalog match exists.

Candidate score v1: weighted normalized interest relevance, anchor strength, and repeat-across-days evidence; subtract previous exposure and explicit dismissals. Component values are comparable only within the versioned model. Diversify greedily by artist and contributing person. Experimental allocation: 12 core-interest, 6 current-interest, 4 bridge/exploration, 2 rediscovery slots; redistribute empty pools rather than inventing content. Artist cap initially 2 in a 24-item batch. Keep a slot for each sufficiently supported smaller interest before filling remaining positions. Tune using evaluation rather than presenting coefficients as scientific conclusions.

Known/unknown uses observed history plus explicit picks/saves. Describe unobserved songs as "not in your recorded history." Display popularity-normalized overlap where feasible so a universally common song does not dominate all social paths. Do not count synthetic seed personas as real popularity or recommendation-quality evidence; identify/exclude them before evaluation.

Evidence is a typed union: shared public pick, same artist, external relationship with attribution, or own rediscovery. Store anchor IDs and contributing public pick IDs. Build text from templates. Recheck evidence visibility at serve time; a private/deleted pick must not remain exposed through a cached recommendation. Never name a listener based on private imported events. A recommendation save is not a public pick.

Feedback: saves and "more like this" are positive; explicit dismissals suppress that song. "Not now" expires; "hide artist" is a separate user choice. Previews, outbound clicks, and impressions are weak engagement observations, not proof of full listening. Later matching listens can be reported as observed returns, not causal proof the recommendation caused the play. Feedback should alter discovery faster than long-term taste and avoid treating unshown songs as rejected.

Later external adapters: Last.fm similar tracks and ListenBrainz recommendations, each with explicit attribution, eligibility, rate limits, empty-result fallback, and cached availability. This is how inventory grows beyond the app's initial catalog. Do not depend on those adapters for the first vertical slice.

## API and UI contracts

All user routes derive profile ID from `getCurrentProfileId()`. Mutating routes validate origin/CSRF expectations, bound inputs, allowlist providers and use fixed provider base URLs (no user-supplied fetch URL). Await dynamic route params. Return safe errors; never raw upstream URLs containing API keys. Set personal responses `Cache-Control: private, no-store`.

```text
GET/POST /api/listening/connections
DELETE   /api/listening/connections/[provider]
PATCH    /api/listening/preferences
POST     /api/listening/sync
GET      /api/listening/jobs/[id]
GET      /api/listening/summary
GET      /api/discovery?mode=close|explore&anchorSongId=...
POST     /api/discovery/feedback
GET      /api/cron/listening-sync    (scheduler secret, service role)
```

Summary response includes snapshot ID, primary source, as-of time, separate sync/coverage status, recent artists/tracks, interest list, and changes. Discovery response includes batch/snapshot IDs, evidence-backed songs, rank, novelty category, and expiry. Anchor validation enforces visibility; arbitrary IDs cannot expose private picks.

UI changes, in order:

1. Add `components/listening/source-settings.tsx` and `weekly-summary.tsx` to Profile, including no-portrait users. Show both provider statuses, primary choice, consent, sync progress, disconnect/delete outcome, and empty-history guidance.
2. Add real discovery fetching through `lib/real-api.ts` / `lib/api.ts`; use account identity, snapshot, feedback revision, and exploration mode in SWR keys. Clear on sign-out/account changes. Keep demo behavior separate.
3. Extend `components/galaxy/song-sheet.tsx` with real related-song results, reason, save/dismiss and existing preview/outbound actions. “Add meaning” invokes the existing pick/tag flow; it is a separate action from saving.
4. Add discovery song DTOs instead of forcing listener-less suggestions into `SongStar` with invented `myWhy`, listener counts, or cluster IDs. Build an explicit adapter into render nodes.
5. Extend galaxy canvas, Three.js scene and SVG fallback for personal discovery nodes, anchor-song/interest positions, and accessible selection. No preview availability means an outbound link, not a lower taste score.

Preview instrumentation goes in `lib/preview-player.ts` only after defining event semantics: one preview-start per exposure, actual playback start only, no success on failed autoplay, and no full-listen claim. Do not scrobble previews back to either service.

## Stable galaxy updates

Preserve existing people layout in the first release and add discoveries afterward. Distinguish the existing meaning clusters from personal listening interests. New songs can orbit an anchor song or personal interest without becoming a fake person's pick.

Add a layout reconciliation function in `lib/galaxy-layout.ts`: keep coordinates for retained node IDs; place arrivals near their known anchor with deterministic collision offsets; remove departed nodes on explicit refresh. Clamp motion and honor reduced-motion in both renderers. Freeze the selected/open song and camera during a refresh.

Fetch a versioned discovery batch and pin it during exploration. Poll lightweight status while visible or after manual sync; show "New discoveries ready" and adopt on request/re-entry. Never rerun the full 300-tick people simulation for every imported event.

If later one response mixes evolving people and songs, add a combined galaxy snapshot endpoint rather than independently retrieving mismatched versions. A hop keeps the viewer's personalization private; it must not return the target's imported history. Finish the legacy `primary_cluster` -> topic cluster migration before changing public person positions from taste. That migration is not a prerequisite for the personal overlay.

## Ordered implementation slices and acceptance gates

1. **Foundations:** add source/track/event/job migration, typed adapter contracts, synthetic fixtures, repository RPCs and tests. Prove RLS isolation, idempotent page commit, lease recovery, generation fencing, primary-owner constraints. No UI or hosted migration required yet.
2. **Real imports:** implement both adapters, CLI worker, connection routes, Profile source settings. Prove recent-first bounded import, progress after interruption, correct retry handling, private username-only behavior, and disconnect during an active fetch. Run with one consenting account per provider after fixture tests.
3. **Taste:** add daily aggregate/snapshot migration, pure scoring, artist-led interests, summary route/UI. Prove repeat caps, elapsed-time decay, source switching, short-history labels, timezone/DST boundaries, and complete atomic publication.
4. **Discovery:** bounded public catalog RPC, evidence templates, batch/save/feedback tables, ranker, real song-sheet replacement. Prove multi-interest representation, artist diversity, no privacy leaks, no fabricated acoustic claims, and saves not creating picks. Initial retrieval can use explicit picks if imported-data analysis eligibility remains unresolved.
5. **Galaxy:** discovery DTOs, stable placement, versioned refresh, SVG/Three.js parity. Demonstrate an anchored path from familiar song to unfamiliar song, saving and returning without repositioning the whole map.
6. **Operations:** configure actual scheduler, confirm consumer cadence, monitor backlog/latency/errors, run canary, enable per-profile flags. Confirm no browser needs to remain open for syncing.
7. **Expansion:** independently evaluate external inventory, ownership verification, public sharing, graph interests, and source merging. Each gets explicit fixtures and rollout gates.

Each slice updates contract/env examples where applicable. Add `test` using existing `tsx --test` plus Node's built-in assertions for pure/adaptor tests; avoid introducing a large framework just for these modules. SQL integration tests run against a disposable local Supabase instance, never the hosted database. Do not call live Gemini/provider services in automated tests.

## Cross-source merge specification (later)

Merge only across providers, never collapse genuine same-provider repeats. Match compatible recording identities one-to-one in a calibrated time tolerance, account for start/end timestamp conventions, and preserve unmatched records. Exact IDs take precedence over conservative text matches; live/remix variants must not match merely because the base title is similar. Keep membership/provenance separately from canonical playback records so merge rules and source removal are reversible. Replay same-song bursts, clock offsets, duplicated importer chains, and missing metadata fixtures before enabling. Until then primary mode has predictable counts.

## Validation and operating limits

- Unit/adaptor tests: Last.fm HTTP-200 error payload, now-playing, inclusive boundaries, ListenBrainz exclusive timestamp boundaries, same-second groups, retries, malformed/future timestamps, multi-artist credits and version distinctions.
- SQL: RLS, cross-owner FK attempts, duplicate jobs, worker crash, stale lease, delete/reconnect race, retry page write, source switch while publishing, private evidence removed after caching.
- Taste/ranking: deterministic replay at fixed clock, separate ambient/metal fixture interests, no collapse to dominant artist, stable small interests, missing-data vs inactivity, no future leakage in time-split evaluation.
- UI: new account without portrait, zero listens, partial sync, API outage, expired evidence, empty catalog, preview unavailable, mobile, reduced motion, SVG fallback, account switching.
- Checks per relevant slice: focused tests, `npx tsc --noEmit`, lint for changed files, production build after route/UI integration. Baseline only TypeScript was checked during planning.
- Operational counters: job age, fetched/inserted/deduplicated counts, provider latency/rate-limit errors, snapshot age, unresolved identity fraction, candidate pool coverage. Logs exclude credentials and raw listening payloads.
- Quality: save/dismiss rates per impression, artist diversity, interest coverage, observed later returns; compare against a simple artist/overlap baseline. Impression-aware denominators and time-split replay prevent inflated success claims. No production latency/SLO claims before measurement.
- Retention defaults: 120 days of raw history/aggregates, bounded recent snapshots/batches, documented deletion for derived data. Longer-term core taste initially means the observed recent months; durable multi-year memory would need a separately designed retained aggregate policy.

## Configuration and external dependencies

Initial env additions when implementing: `LASTFM_API_KEY`, `CRON_SECRET`, `LISTENING_ENABLED`, `DISCOVERY_ENABLED`. Existing Supabase credentials stay server-side as appropriate. Read-only ListenBrainz username retrieval needs no new app secret. `LASTFM_API_SECRET` and MetaBrainz OAuth credentials are added only with verified authentication flows. Never use `NEXT_PUBLIC_` for secrets or print the contents of `.env.local`.

Before public release verify Last.fm usage/approval terms and the rights for derived analysis and external recommendation data. Preserve data provenance; treating metadata as plain strings or retrieving it through an intermediary does not by itself establish permission for profiling/AI use. This plan does not authorize bypassing restrictions. Implement adapters and fixture-based algorithms independently of enabling an ineligible data path.

ListenBrainz's app-initiated Spotify connection requires approval for `listenbrainz:connect-services`; do not present it as an immediately available OAuth feature. Initial UI directs users to configure the service on ListenBrainz itself. Ownership verification and sharing are separate future work.

Unverified deployment facts: hosted migration state, scheduler plan, provider credentials/access, actual history quality, and public catalog coverage. None blocks writing the first local implementation slice; all relevant ones must be checked before rollout. No purchases, provider registrations, hosted schema changes, or deployments were performed during preparation.

## Coding instructions for implementation

The examples below are proposed contracts and implementation sketches, not existing exports. Implement their validation, persistence and tests before wiring callers. Keep each slice buildable. Do not copy an example into production with an unimplemented helper or silently successful stub.

### A. Create contracts before adapters

Create `lib/listening/types.ts` as a dependency-free module. Use seconds explicitly for provider timestamps and milliseconds explicitly for execution deadlines. Model completion separately from having an empty page.

```ts
export type ListeningProvider = "lastfm" | "listenbrainz";

export type RecordingIdentity = {
  title: string;
  artistCredit: string;
  album?: string;
  recordingMbid?: string;
  providerTrackId?: string;
  versionHint?: string;
};

export type ObservedListen = {
  recording: RecordingIdentity;
  playedAtSec: number;
  providerEventId?: string;
};

export type SyncCursor =
  | { provider: "lastfm"; page: number }
  | { provider: "listenbrainz"; beforeSec: number };

export type FetchPageInput = {
  username: string;
  lowerInclusiveSec: number;
  upperExclusiveSec: number;
  cursor: SyncCursor | null;
  signal: AbortSignal;
};

export type ListenPage = {
  events: ObservedListen[];
  nextCursor: SyncCursor | null;
  rangeComplete: boolean;
  retryAfterMs?: number;
};

export interface ListeningAdapter {
  provider: ListeningProvider;
  validateUsername(username: string, signal: AbortSignal): Promise<string>;
  fetchPage(input: FetchPageInput): Promise<ListenPage>;
}
```

Implement cursor/provider consistency checks at runtime. Parse upstream JSON as `unknown`, narrow records and arrays with explicit guards, validate string lengths/finite integer timestamps, and reject out-of-range records. Never cast an unchecked response directly to `ListenPage`. Normalize into the internal half-open range even when a provider uses different boundary semantics. Extend the ListenBrainz cursor with explicit boundary-recovery state if tests show it is needed; do not decrement seconds blindly and skip same-second listens.

Create factories `createLastfmAdapter({ apiKey, fetchImpl })` and `createListenbrainzAdapter({ fetchImpl })`. Read environment variables in server configuration, not when importing these testable modules. Build URLs with `URL`/`URLSearchParams`, fixed hosts, and encoded usernames. Redact query keys from logs and thrown errors. Use a typed provider error with `code`, `retryable`, and optional `retryAfterMs`; distinguish invalid username, rate limiting, unavailable provider, and malformed payload.

### B. Implement the database transaction boundary explicitly

Create migrations for tables, indexes, RLS and worker RPCs together. Do not use multiple independent Supabase HTTP writes as if they were one transaction. The worker repository should expose:

```ts
export interface SyncRepository {
  claimDueJob(nowIso: string): Promise<ClaimedJob | null>;
  commitPage(input: CommitPageInput): Promise<{
    inserted: number;
    duplicates: number;
    inputRevision: number;
  }>;
  releaseJob(input: ReleaseJobInput): Promise<void>;
  failJob(input: FailJobInput): Promise<void>;
}
```

Define the referenced input types in `repository.ts`: every mutation carries job ID, random lease token, connection generation and expected checkpoint revision. `ClaimedJob` includes the frozen query bounds, cursor, username and provider. These types are server-side and must never be returned wholesale to the browser.

Implement `claim_listening_job` and `commit_listening_page` as restricted SQL functions. Claim using `FOR UPDATE SKIP LOCKED`; atomically set lease expiry and increment attempt count. Page commit locks/rechecks the connection and job, validates lease/generation/checkpoint, inserts or resolves minimal track identities and idempotent events, records dirty aggregate dates, and advances continuation in a single transaction. Track inserted event IDs with `RETURNING`; do not increment aggregate counts for conflict rows.

Use a unique `(id, profile_id)` key on connections and a composite foreign key from events where needed to prevent cross-owner relationships. Validate the primary connection similarly. Database writes use server time for lease validity; injected application clocks are for deterministic scoring and tests, not bypassing lease expiry.

In `listening_tracks`, make provenance/ownership explicit: initial identities are scoped to the profile, with unique `(profile_id, identity_fingerprint)` and an optional link to the existing global `songs` row. Scope aliases the same way. RLS must not expose another user's imported catalog or listening patterns. Global deduplication can be a later internal optimization.

### C. Implement the worker independently of Next.js

`worker.ts` accepts adapter registry, repository, pacing service, clock, and limits. It contains no request cookies, React imports or Gemini calls. Implement the following sequence, with `try/finally` lease handling:

```text
claim -> verify provider -> acquire shared provider request slot
      -> fetch page -> validate -> atomic commit
      -> continue within budget OR release with continuation
```

Never sleep through a long provider backoff inside a request. Persist `next_attempt_at`, release the lease and let a later invocation continue. A lost lease stops processing; it must not publish a stale page. Enforce page limits, elapsed-time limits and cancellation. A single user's large backfill must not monopolize all due work.

`scripts/sync-listening.ts` is a thin CLI around this same worker. Load local env using the project's environment convention, accept explicit bounded flags such as `--max-jobs`, and print counts/status only. The cron route invokes the same worker after constant-time secret verification. Manual-sync routes enqueue an owner-scoped job, never accept a worker lease or arbitrary profile ID from the client.

### D. Implement thin authenticated routes

Use the existing `getCurrentProfileId()` and service-role repository behind validated routes. Use the session client for owner reads when practical. Each route must check feature availability and authentication; writes must enforce same-origin expectations. Add a shared safe JSON response/error helper for the new routes rather than changing unrelated API behavior.

Shape for `app/api/listening/sync/route.ts` (helper names below must be implemented):

```ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { enqueueOwnSync } from "@/lib/listening/repository";
import { requireListeningEnabled, requireSameOrigin } from "@/lib/listening/http";
import { parseSyncRequest } from "@/lib/listening/validation";

export async function POST(req: NextRequest) {
  // Put this body inside the shared typed-error boundary in the final route.
  requireListeningEnabled();
  requireSameOrigin(req);
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { provider } = parseSyncRequest(await req.json());
  const job = await enqueueOwnSync(profileId, provider);
  return NextResponse.json(
    { jobId: job.id, status: job.status },
    { status: 202, headers: { "Cache-Control": "private, no-store" } },
  );
}
```

Map malformed JSON/body to 400, absent/foreign resources to an appropriate non-leaking 404, unauthorized to 401, cooldown to 429, and transient dependency failure to 503. Repeated sync clicks return the existing active job. GET job status checks owner before returning sanitized counters. In `[provider]` and `[id]` routes, await `context.params` as required by the installed Next.js version. Do not enable static route caching for personal data.

### E. Write pure taste functions and a versioned publisher

Keep `score.ts` independent of Supabase and environment variables. Pass `asOfSec` and validated settings explicitly; do not call `Date.now()` inside ranking functions.

```ts
export function decayedContribution(
  plays: number,
  ageDays: number,
  halfLifeDays: number,
): number {
  if (!Number.isFinite(plays) || plays < 0 ||
      !Number.isFinite(ageDays) || ageDays < 0 ||
      !Number.isFinite(halfLifeDays) || halfLifeDays <= 0) {
    throw new Error("Invalid contribution input");
  }
  return Math.log1p(Math.min(plays, 5)) * 2 ** (-ageDays / halfLifeDays);
}
```

Aggregate whole local calendar dates using validated IANA timezone conversion; never assume every local day is 86,400 seconds. For rolling windows, filter exact UTC event bounds before aggregation so the oldest partial date is handled correctly. Daily aggregates accelerate full interior dates; boundary dates use events. Changing timezone marks all affected derived state dirty.

`buildTasteSnapshot(input)` returns recent/core song and artist distributions, stable artist-led interests, supporting counts, coverage and model version. Sort all ties by stable identity. Return insufficient-evidence state when appropriate; do not normalize an empty distribution into fabricated values. Snapshot publication is an RPC with compare-and-swap on input revision, primary generation and algorithm version.

### F. Implement evidence before recommendation copy

Add these proposed discriminated unions to `lib/discovery/types.ts`:

```ts
export type DiscoveryEvidence =
  | { kind: "shared_public_pick"; anchorSongId: string;
      otherProfileId: string; anchorPickId: string; candidatePickId: string }
  | { kind: "same_artist"; anchorTrackId: string; artistKey: string }
  | { kind: "rediscovery"; trackId: string; lastObservedAt: string }
  | { kind: "external_relation"; provider: "lastfm" | "listenbrainz";
      sourceUrl: string; anchorTrackId: string };

export type DiscoveryAction =
  | "impression" | "preview_started" | "open_external"
  | "save" | "unsave" | "not_now" | "dismiss" | "more_like_this";
```

Keep `hidden_artist` as a separate preference mutation if implemented, not an ambiguous song dismissal. Restrict external source URLs to verified provider/catalog links. `evidence.ts` renders deterministic copy after fetching authorized, current labels; never interpolate unverified text into HTML. Revalidate contributing picks' current visibility before response serialization. Drop invalid evidence or the candidate if nothing supportable remains.

Candidate retrieval returns bounded pools per interest before ranking. `rank.ts` takes explicitly normalized feature values; `diversify.ts` enforces song uniqueness, artist caps, interest coverage and pool budgets with deterministic ties. For the first release do not infer artist identity through substring matching or claim a song is obscure solely because our small catalog has few picks.

`feedback.ts` records a server-validated event, applies save/dismiss state transactionally and increments feedback revision. The route verifies the candidate belongs to the caller's batch. Do not route saves through `POST /api/picks`. A later explicit “Add meaning” action collects required tags/mood before using that existing endpoint.

### G. Wire frontend boundaries without changing existing meaning types

- `lib/real-api.ts`: add `getListeningConnections`, `getListeningSummary`, `getDiscovery`, `syncListening`, and `recordDiscoveryFeedback`; normalize HTTP errors without leaking provider detail.
- `lib/api.ts`: export real methods through the existing data-source boundary. Mock implementations use dedicated synthetic fixtures, never live requests or new production imports from `lib/sim`.
- New `DiscoverySong` DTO: catalog song details, evidence list, interest key, anchor song ID if available, batch/snapshot IDs, category, save state. It has no fabricated listener or feeling fields.
- `components/listening/source-settings.tsx`: explicit loading/error/empty/connected states, disabled duplicate sync clicks, job-status polling only while pending, and reconnect/change-source confirmation explaining data replacement.
- `components/galaxy/song-sheet.tsx`: invoke a discovery hook when a real selected song exists; keep existing mock path separate. Retain previews and selection actions. Do not launch fetches in render or add conditional hooks.
- `lib/preview-player.ts`: emit actual successful playback-start once per preview exposure; failed autoplay/error produces no positive event. Keep audio state separate from network retries and consent.
- `lib/galaxy-layout.ts`: implement pure `reconcileDiscoveryLayout(previous, next, anchors)` with stable IDs and deterministic collision handling. The first version never changes people coordinates. Unknown anchors get an explicit personal-interest position, not a guessed meaning cluster.
- Both `galaxy-scene.tsx` and `galaxy-svg.tsx` must support the new node subtype, focus, labels and selection. Check all switches over node kind when extending `lib/types.ts`; do not use unsafe casts to masquerade as a person node.
- SWR keys include account identity and snapshot/batch context. On sign-out, clear personal caches and pending UI. Preserve the selected song and camera until the user adopts a new batch.

### H. Add executable tests alongside each layer

Use `node:test` and `node:assert/strict` through the already installed `tsx`. Add synthetic fixtures under `tests/fixtures/listening/`; do not commit exported personal histories. Suggested test modules:

```text
tests/listening/providers.test.ts
tests/listening/identity.test.ts
tests/listening/worker.test.ts
tests/taste/score.test.ts
tests/taste/interests.test.ts
tests/discovery/rank.test.ts
tests/discovery/evidence.test.ts
tests/galaxy/discovery-layout.test.ts
```

Mock dependencies at adapter/repository boundaries instead of monkey-patching application globals. Unit tests exercise worker state transitions with a fake repository; SQL integration tests additionally prove real atomicity/RLS/leases against a disposable local instance. One does not substitute for the other.

Explicit fixture expectations: importing the same 10 listens twice yields 10 events; 3 real repeats at different times remain 3; a now-playing item yields 0 completed events; stale generation cannot insert or publish; a private/deleted public pick cannot be named from cache; equal scores have deterministic order; adding one discovery node changes no existing people coordinates. For same-second indistinguishable duplicate rows, assert the documented collapse rule rather than an impossible guarantee.

Run focused tests as files are implemented, for example:

```sh
npx tsx --test tests/listening/providers.test.ts tests/listening/worker.test.ts
npx tsx --test tests/taste/score.test.ts tests/taste/interests.test.ts
npx tsx --test tests/discovery/rank.test.ts tests/discovery/evidence.test.ts
npx tsc --noEmit
```

Add a `test` package script using an explicit portable discovery runner or enumerated files once the suite exists; do not assume a shell expands recursive `**` globs identically on all hosts. Run ESLint on changed implementation files and `npm run build` after route/UI integration. Only run database reset/apply commands after verifying the target is disposable local Supabase, never infer that from available credentials.

### I. Completion instructions for the implementing agent

Start with slice 1 from the ordered plan. Read `AGENTS.md`, inspect the current git diff and latest migration names again, and preserve unrelated work. Implement types, fixtures, migrations/RPCs and repository tests before provider HTTP integration. Update this plan with completed slices and deviations supported by tests; update the database contract only for schema actually implemented.

Do not label a slice complete merely because TypeScript compiles: report the acceptance tests exercised, any external checks not run, and the remaining rollout dependency. Do not register accounts, purchase hosting, deploy, or apply hosted migrations as an incidental part of preparing local code. The finished first slice must leave the old application behavior intact with feature flags disabled.

## Reference sources

- Last.fm recent tracks: https://www.last.fm/api/show/user.getRecentTracks
- Last.fm similar tracks: https://www.last.fm/api/show/track.getSimilar
- Last.fm usage terms: https://www.last.fm/api/tos
- ListenBrainz bounded listening queries: https://listenbrainz.readthedocs.io/en/latest/users/api/core.html
- ListenBrainz service connection scope: https://listenbrainz.readthedocs.io/en/latest/users/connect-music-services.html
- ListenBrainz recommendations: https://listenbrainz.readthedocs.io/en/latest/users/api/recommendation.html
- Spotify policy (profiling/AI restrictions): https://developer.spotify.com/policy
- Vercel cron cadence limits: https://vercel.com/docs/cron-jobs/usage-and-pricing
