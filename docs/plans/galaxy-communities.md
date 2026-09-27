> Saved 2026-09-26. Status: **steps 1-6 of the revised path built and verified live in the browser**, on
> branch `galaxy-communities` (uncommitted). A real seeded session (Maya) opened Listening Scenes, saw 4
> real published scenes, opened "Ambient & Dream Pop," saw a real gateway (Anish) and a real novel song
> ("Skinny Love" by Bon Iver) with a real relevance explanation, tapped "Say hi via Anish," and the
> existing hop/breadcrumb/recenter mechanism fired correctly — no new transition code needed, by design.
> Direction B (song-derived communities) is real and live for the first time, distinct from and never
> confused with `primary_cluster`. Not yet done: committing this work, and Direction B's classification
> pipeline remains a small, hand-curated set (4 scenes) pending catalog density (backburner #5) — see the
> real run results recorded below.
>
> Written on branch `pitch-demo` originally. Third pass.
> First draft conflated the five listening clusters with music communities. Second pass fixed the
> resulting bugs (destination-first gateway query returning people hop's own guard would reject, missing
> `is_public` filtering) but still treated "listening worlds" as a required, production-built bridge to
> real music communities. Third pass (this one) rejects that staging: Direction A is demoted to an
> internal/pitch-only experiment, not a prerequisite; the clustering method, schema, and scope of
> Direction B are corrected for several concrete modeling traps (chaining clustering, unstable scene
> identities, winner-take-all membership, a confidence field that isn't one, deferring the actual product
> value). Nothing in this doc is approved for implementation.

# One real music community, built narrow and end-to-end

## The problem with the first draft
The first draft said the five clusters (`lib/clusters.ts` `CLUSTER_IDS`: `quiet_company`, `armor_up`,
`carrying_loss`, `somewhere_else`, `old_selves`) could just "become real, separately-enterable galaxies."
That's wrong, and it's wrong in a way that matters to the product, not just the wording.

Those clusters are **emotional listening modes** — why someone reaches for a song — not **musical
scenes**. Someone in `carrying_loss` might listen to country, ambient, punk, or soul. Grouping people by
*why* and presenting that group as a *scene you can travel into and discover new music in* overpromises:
entering that "galaxy" reliably shows you people who share a reason, not people who share a sound. It
would recreate, in a bigger and more visual form, exactly the mistake the whole product already rejects
elsewhere ("Clusters are a grouping label for the galaxy, not a matching signal" — CLAUDE.md).

## Two honest directions, and why they aren't staged as A-then-B anymore
**Direction A — Listening worlds.** The five clusters, named for what they are: "Quiet Company,"
"Carrying Loss," "Somewhere Else." The promise is *"travel into the different reasons people use music,"*
not taste discovery.

**Direction B — Music communities.** Separate, song-derived scenes: "Late-night electronic," "Shoegaze
revival," "Modern psychedelic soul." The promise is *"explore musical scenes beyond your current taste."*
This is the actual product idea worth having.

**Revised decision** (this pass): building A for real — production SQL, production UI, real per-cluster
gateway ranking — does not test B's proposition and isn't required to reach it. `/pitch` already validates
the entire navigation experience: camera movement, destination discs, bridge lines, gateway entry, the
handshake beat. Building the same mechanics again against real listening-world data would test real-data
plumbing, not the core taste-expansion idea, and it's not free — a real ranked-gateway query, a real
production toggle, and real terminology-safe copy are genuine backend and UI work. Worse: the existing
`ClusterFilter` already lets someone browse people by why, today, in the current window. Turning the same
five categories into full navigable worlds adds real visual ceremony on top of a discovery mechanism that
already exists, without introducing a new *kind* of discovery.

**Direction A remains an internal or pitch-only navigation experiment unless user testing shows that
exploring emotional listening modes has independent product value. It is not a prerequisite for Direction
B.** If it's ever built for real, that's its own decision made on its own evidence, not a "warm-up" step
for communities.

## Fixing "home" — three things the first draft collapsed into one
The first draft said "Home: your own cluster — same as today's single window." That's wrong on both
halves: today's window isn't your cluster (it already mixes matches, wander stars, and newcomers across
different clusters), and your cluster shouldn't be presented as a place at all. Three separate concepts,
kept separate:
- **Home galaxy** — the people you've actually connected with, plus faint suggestions. A social graph,
  not a cluster.
- **Current window** — `GalaxyResponse`'s bounded, paginated slice of that graph for one render
  (`galaxy_pool`, far stars, newcomers, sampling/`hidden` counts). A rendering/technical concept, never
  named as a "place" to the user.
- **Primary why** (`primary_cluster`) — an explanatory attribute on a person ("this is the reason they
  listen"), shown as color/label/filter. Never a location.
A "listening world" or a "music community" is a distinct fourth thing if either is ever built: a
deliberately separate, explicitly-labeled navigation destination, not a reinterpretation of home or of the
window.

## Gateway detection: destination-first, not window-dependent
A destination's reachability must not depend on which handful of people happened to be drawn in the
viewer's most recent window render — that makes "locked" a pagination accident, not a meaningful signal.
Fixed rule, and it applies to whichever destination type is ever built (listening world or music
community):
1. Pull real candidate members scoped to the viewer's own `galaxy_pool` (the ~700-candidate pgvector pool
   already computed per viewer), filtered to the destination in question — **not** literally every profile
   who belongs to it app-wide. This is the load-bearing correction: it must stay bounded to something hop
   is already allowed to center on (see the reconciliation below), while still being large enough
   (~700 candidates, not the handful actually drawn in one render) that "locked" means something real.
2. Rank them against the viewer with the existing cheap signal (pgvector proximity — the same math
   `galaxy_pool` already produces, just filtered to the destination).
3. Return the best eligible one, **only from picks where `song_picks.is_public = true`** (same rule
   matching/cards already follow — a private pick must never surface someone as a gateway).
4. Only mark the destination locked if no candidate clears whatever eligibility bar is set. Start
   permissive (any candidate, no similarity floor) — small per-cluster/per-scene populations mean a strict
   floor risks most destinations showing locked and the feature reading as broken, not selective.

**Reconciliation with hop's own security rule** (a real bug caught in the second pass, not just a
nuance): hop's existing guard, `assertHopAllowed` (`lib/matching/galaxyWindow.ts`), only allows centering
on someone already in the *viewer's own `galaxy_pool`*. Scoping the ranked-gateway query to the viewer's
pool (step 1) fixes this with no change to hop itself.

**A known constraint, not a solved problem**: scoping to `galaxy_pool` is correct for today's hop
authorization, but it biases every destination's gateway toward people the existing matcher already
favors — which works against genuine exploration, especially for Direction B's "beyond your current
taste" promise. Document this as a real limitation of the first build, not something to quietly work
around. The long-term fix is a **dedicated scene-entry endpoint** that: selects a gateway from the
destination's full membership (not the viewer's pool), verifies visibility/blocks and that the evidence
used is public, and grants entry for that result directly — without requiring the gateway to already be in
the viewer's ordinary match pool. That's real new authorization design, out of scope for the first build,
but the plan should not pretend the pool-scoped version is the final answer.

That gateway person also isn't "a member of both worlds" — they're a member of the destination who has a
real, ranked connection to the viewer. Describe them as **"your closest bridge into this world,"** not a
dual citizen.

## What the backend actually gives us, and what it doesn't
Reusable as-is: `profiles.primary_cluster`, `galaxy_cluster_counts`, the rendering primitives
(`GalaxyDestination`, `bridges`, `computeHomeLayout`, destination/bridge drawing in `galaxy-scene.tsx`/
`galaxy-svg.tsx`), and hop itself (`assertHopAllowed`) as the entry mechanic once a gateway is chosen.
`/pitch` already exercises all of this against fictional data — that's the interaction prototype, and it
doesn't need to be rebuilt against real data just to prove the mechanics work.

Not yet true, and worth naming plainly: no ranked-gateway query exists yet for any destination type
(`galaxy_pool` ranks against the viewer's *general* pool, not per-destination); no representative-song
concept exists; no membership-weight concept exists; nothing explains *why* a destination is relevant to
a specific viewer; nothing surfaces a novel song a viewer doesn't already have. That last one isn't a
"nice to have" — see below.

**Demo-scale risk, called out explicitly**: the live seed data (`scripts/seed-real-data.ts`) has ~27 picks
across ~7 profiles. Any destination-based feature — listening worlds or music communities — depends on
CLAUDE.md backburner #5 (more seed personas) to have enough population to look real, not just to look
good.

## Revised path
1. **Keep `/pitch` as the interaction prototype.** It already validates camera movement, destination
   rendering, bridges, and entry — no real-data rebuild of that mechanic is a prerequisite for anything
   below.
2. **Test the current embedding signal against a larger, intentionally varied song set** — not just the
   current ~27 seed picks. See "Signal validation" below; this is a hard gate, not a formality.
3. **Choose the scene signal** — done: step 2's real run shows the embedding alone fails (hip-hop/soul
   collapse, punk/metal blur) while MusicBrainz tags are accurate but sparse. Decision: **hybrid** —
   MusicBrainz tags primary where available, embedding similarity as a lower-confidence fallback only for
   songs MusicBrainz can't tag.
4. **Create 6–8 stable, reviewed scenes and weighted song memberships** — a small, human-reviewed starting
   set, not a fully automated pipeline from day one. **Run against the real catalog (2026-09-26,
   `scripts/propose-song-scenes.ts`, branch `galaxy-communities`): only 4 genuine candidates exist**
   (`folk`: Bon Iver "Holocene" + José González "Heartbeats"; `classical`: Satie + Einaudi; `art pop`:
   Sufjan Stevens ×2 + Fleetwood Mac "Landslide"; `ambient pop`: Bon Iver "Holocene"/"Skinny Love"), each
   2-3 songs. The embedding-fallback pass (used for MusicBrainz-untagged songs) reproduced the exact
   mood-clustering failure from the signal-validation run: at similarity ≥0.6, "alternative r&b" absorbed
   21 unrelated songs (Johnny Cash's "Hurt," Survivor's "Eye of the Tiger," Marconi Union's ambient
   "Weightless"), and the eval script already showed genuinely different genres routinely score 0.6-0.7, so
   there's no threshold that both excludes that noise and still assigns anything useful. **This is not a
   tuning problem — the catalog (40 rows, heavily duplicated, per backburner #1) is too small and too
   MusicBrainz-tag-sparse for 6-8 real scenes yet.** Two honest options, not a code fix: (a) publish only
   the 4 real tag-verified candidates now, below target but not fabricated, and grow the count as the
   catalog grows (ties directly to backburner #5, more/denser seed personas); or (b) hold Direction B's
   first real destination (step 5) until the catalog has enough density for a stronger set. Don't loosen
   the embedding-fallback threshold to hit a number — that's the exact shortcut this document exists to
   catch.
5. **Build one real destination end-to-end**: representative unfamiliar songs, a relevance explanation,
   a real gateway, and real entry. This is the first slice that actually tests the product's value.
6. **Connect one Song Handshake and fly-home transition** to that single real destination.
7. **Only after that works**, use clustering to *propose* new scenes for human review — never to silently
   redefine the universe on every run.

## Direction B: classification design

### Signal validation — RUN, result: fails as a sole signal (2026-09-26, `scripts/evaluate-song-scene-signal.ts`, branch `galaxy-communities`)
Ran the procedure below for real against a 24-song, 8-genre eval set (not the live catalog — see rationale
below). **Verdict: `songs.embedding` alone fails the stop condition.** Raw genre-agreement across top-3
neighbors was 51%, but that average hides the real pattern: classical clustered almost perfectly
(0.65–0.82 similarity, likely because these composers are unusually distinct in the model's training data,
not because the embedding tracks genre generally), shoegaze/electronic held together loosely, and **hip-hop
and soul effectively failed** — "N.Y. State of Mind" (Nas) got 0/3 genre-agreement, landing next to two
punk songs; "Ivy" (Frank Ocean, MusicBrainz-tagged `contemporary r&b, r&b, soul`) landed nearest to Kendrick
Lamar and Bon Iver, not another soul track. Punk and metal blurred into each other (0.691 between a
cross-genre pair, higher than several same-genre pairs). Reading the actual Gemini mood summaries side by
side shows why: the same handful of descriptors ("late-night," "solitary," "reckless," "melancholic")
recur across genres, and songs cluster on that vocabulary, not on sound — the exact "why, not what" failure
this document exists to avoid, surfacing statistically instead of as a hand-picked label.

**Decision**: don't use `songs.embedding` as the sole or primary signal. MusicBrainz genre/tags, where they
came back, were clean and genre-accurate (`trap, hip-hop/rap`; `heavy metal, thrash metal`; `folk, folk
rock`) — but coverage was spotty (7 of 24 songs in the eval set got tags back at all; two lookups also hit
the documented MusicBrainz 503-when-busy behavior). So the fix isn't "switch entirely to MusicBrainz"
either — **use MusicBrainz tags as the primary signal where available, falling back to the embedding only
for songs MusicBrainz can't tag**, and treat embedding-only scene assignments as lower-confidence than
tag-based ones (this is exactly what the `source`/`weight` fields in `song_scene_memberships` below are
for — a tag-derived membership and an embedding-derived one shouldn't be treated as equally trustworthy).

Original procedure (still the right method; recorded here for reference):
The plan clusters `songs.embedding`. But `lib/gemini/generateSongContext.ts` shows that embedding is
generated from the plain label string `"Title" by Artist` — the same embedding `buildPickEmbedding` uses
for *mood-based* matching (CLAUDE.md calls it a "mood/context embedding"). There is no guarantee it
separates songs by **genre/scene** rather than by whatever semantic association Gemini's embedding model
attaches to that text. If it doesn't, Direction B would silently reproduce the exact "why, not what"
mistake this document exists to avoid — just via unsupervised clustering instead of a hand-authored
taxonomy, which is harder to notice and just as wrong. Required procedure, not an assumption:
1. Assemble a deliberately varied evaluation set — genres, eras, and moods that don't overlap — not just
   the current seed catalog. 27 picks across 7 people is too small and too correlated with the seed
   personas' own taste to validate anything; eyeballing clusters at that scale risks only validating the
   seed choices, not the signal.
2. Inspect nearest neighbors under the current embeddings for songs in that set.
3. Compare those neighbor lists against MusicBrainz tags (already fetched during song identity
   resolution, and explicitly exempt from the Spotify data restriction per CLAUDE.md) and the existing
   Gemini mood descriptions (`songs.context_summary`), to see which signal the embedding actually tracks.
4. Test whether a human recognizes the resulting groups as coherent musical scenes — not just "these songs
   feel similar."
5. **Stop and switch signal if the embedding primarily reflects artist recognition, mood, or title
   semantics** rather than genre/scene. MusicBrainz tag data is the fallback: purpose-built for genre, not
   repurposed from a mood-matching embedding.

### Clustering method
Given the hybrid signal decision, clustering is now a **smaller job than originally scoped**: songs with
usable MusicBrainz tags form their scenes directly from tag overlap (a simpler grouping problem, closer to
tag co-occurrence than embedding geometry), and clustering only has to handle the residual songs
MusicBrainz couldn't tag — assigning each to the nearest existing scene centroid, or leaving it unclustered
if nothing is close. Single-linkage agglomerative clustering (the second-pass draft's recommendation) is
still the wrong choice for that residual step — it
has a well-known chaining problem: if A is close to B and B is close to C, single-linkage merges all three
even if A and C are very different. One sprawling "scene" stitched together by weak intermediary songs is
exactly the failure mode to avoid here. If clustering is used at all in the experimental phase,
**average-linkage or complete-linkage** is the safer choice — both resist chaining by requiring most or
all pairwise distances within a merge to be small, not just one path through it. No new npm dependency is
still the right call at this catalog size (an O(n²) pairwise-distance pass in TS is cheap for hundreds to
low thousands of songs). But given the signal-validation gate above, treat any clustering output at this
stage as **provisional and reviewed**, not authoritative — step 7 of the revised path (clustering
*proposes* scenes) is the honest framing, not "clustering *is* the scene registry."

### Stable scene identities
A full re-cluster can split, merge, rename, or reorder scenes. A UUID per scene does not solve this by
itself if every batch run creates fresh rows — a scene accumulates real state around it (bridges,
handshakes, user history, saved destinations, product copy, visual identity), and losing that identity on
every re-cluster would break all of it. Instead:
- `song_scenes` is a **stable registry**, not a clustering output table. A clustering run produces
  *proposals* — new candidate groupings — which get matched against the existing registry by centroid
  similarity and reviewed by a person, who explicitly chooses: update an existing scene's membership,
  split one scene into two, merge two into one, or create a genuinely new scene. Nothing in the registry
  changes automatically just because a batch run happened.
- **Generated labels need a human-review step before publishing.** A fully generated community name is
  likely to read as "AI-flavored" in exactly the way the rest of this document has been trying to remove —
  generation is a good first draft, not a final artifact. **This happened for real**, not hypothetically:
  the first live run of `scripts/publish-song-scenes.ts` (2026-09-26) hit a 429 quota error on
  `gemini-flash-latest` for every call, silently fell back to Flash-Lite (the documented fallback
  behavior working as designed), and the fallback model's label for the "art pop" group (Sufjan Stevens,
  Fleetwood Mac) came back as **"Grieving in the Kitchen"** — a mood/scenario label, not a sound
  description, the exact "why, not what" mistake this document exists to prevent. The script had printed
  the output before inserting but auto-inserted as `status: 'published'` regardless — printing is not a
  review gate. Fixed two ways: (1) the 4 published labels were corrected by hand, grounded in the actual
  MusicBrainz tags rather than another generated guess ("Chamber Folk & Art Pop," not a mood phrase); (2)
  the script itself now inserts as `status: 'reviewed'`, never `'published'` — a human must read the
  output and flip the status by hand before the API route will serve it.

### Schema (provisional — depends on the signal-validation outcome)
- `song_scenes`: `id uuid pk`, `label text`, `description text`, `status` (`draft` | `reviewed` |
  `published`), `centroid vector(768)` (only meaningful if embedding clustering is the chosen signal —
  provisional per the validation gate), `created_at`/`updated_at`. This is the stable registry: rows
  persist across re-clustering runs; a run proposes changes, a human commits them.
- `song_scene_memberships` (**many-to-many**, not a single column): `song_id`, `scene_id`, `weight float`,
  `source text` (e.g. `'cluster_v3'`, `'manual'`), `model_version text`. A song can genuinely belong to
  multiple scenes — a single `songs.scene_id` column would repeat `primary_cluster`'s winner-take-all
  problem in a system where genre truly does overlap. This also makes membership explainable to a user:
  "4 of Maya's songs belong strongly to this scene."
  - Optionally, a cached `songs.primary_scene_id` (denormalized from the membership with the highest
    weight) purely for rendering convenience — never the source of truth for membership itself.
  - Naming fix: a per-membership **distance** is lower-is-better; **confidence** conventionally means
    higher-is-better. Don't store cosine distance in a field called `confidence` — store `distance`
    explicitly, or transform it into a calibrated `score` where higher really does mean better, and name
    whichever one is stored accordingly.
- RLS: `song_scenes` and `song_scene_memberships` are catalog-level, not user data — world-readable like
  `songs`, writable only by `service_role`. **Granting `select` to `authenticated` is not itself an RLS
  policy** — if RLS is enabled on these tables (it should be, for consistency with the rest of the
  schema), the migration needs an explicit `create policy ... for select using (true)` (or equivalent) in
  addition to the grant, or reads will be denied regardless of the grant.

### Gateway/population queries
- `scene_counts()` — population per scene, mirrors `galaxy_cluster_counts`.
- `scene_pool(target_profile_id uuid, scene_id uuid)` — candidates with a **public** pick
  (`song_picks.is_public = true`) with membership in that scene (via `song_scene_memberships`, not a
  single column), scoped to the viewer's own `galaxy_pool` per the gateway-detection section above (and
  subject to the same "known constraint, not solved" caveat about biasing toward the existing matcher's
  favorites), ranked against the viewer via `song_picks.embedding` cosine similarity.

### Novel-song surfacing is not deferrable — it's the actual product value
The second-pass draft deferred this. That was wrong: without it, entering a destination just produces
another list of people, which the app already does via matching and hop. The first real Direction B slice
(revised path step 5) must answer three things, not just "who's here":
- **What unfamiliar song represents this scene** — a song with real, weighted membership in the scene
  that the viewer does not already have in their own picks.
- **Why this viewer might like it** — a short, specific relevance explanation, not generic scene
  description. Likely one more `generateJson` call per (viewer, destination) pair, using the viewer's
  portrait/picks and the candidate song's `context_summary` — same pattern as everything else in
  `lib/gemini/`, not a new architecture.
- **Which person can introduce them to it** — the gateway from the query above, tied specifically to that
  song where possible (they picked it, or a song like it).
Classification infrastructure that produces scenes and populations without this output does not validate
whether the product idea works — it validates that clustering ran.

### Pipeline
A clustering run is an **offline proposal step** (`scripts/propose-song-scenes.ts` or similar), reviewed
by a person against the existing registry as described above — not a live or automatically-applied
process. This is intentionally the same shape as every other backfill/regenerate script in this repo
(`generate-portraits.ts`, `recompute-pick-embeddings.ts`), except its output is a diff for a human to
approve, not a direct write.

### Explicitly deferred past the first real slice
Full automation of the propose → review → publish loop; activity/density-over-time signals; the dedicated
scene-entry endpoint that removes the `galaxy_pool` gateway constraint; Direction A built for real
(demoted above to "not a prerequisite," revisit only with independent evidence of its value).

**Step 5 verified end-to-end (2026-09-26)**, live, as a real seeded session (Maya) through the actual
`GET /api/scenes/[id]` route, not a script: all 4 published scenes returned a real gateway, a real novel
song the viewer didn't already have, and a real relevance explanation. One result concretely validates the
"start permissive, no similarity floor" decision in the gateway-detection section above: Noor was returned
as the gateway into "Chamber Folk & Art Pop" at similarity 0.32 — any floor near 0.5 would have wrongly
locked a destination that has a real, legitimate bridge.

## Critical files (revised path, steps 2–6 — nothing here is stage-gated behind Direction A anymore)
New: a signal-validation script (step 2, throwaway/diagnostic, not shipped); a migration for the stable
`song_scenes` registry + `song_scene_memberships` (many-to-many, with explicit RLS select policies, not
just grants); a small human-curated batch of 6–8 initial scenes (step 4, likely seeded by hand from the
validated signal rather than a full unsupervised pipeline on a catalog this small); `scene_counts()` /
`scene_pool()` SQL functions; one Gemini call for novel-song relevance explanation per (viewer,
destination); the single real destination's UI slice (not a five-destination toggle — one, end-to-end).
Changed: `db/contract.md` (new tables/functions once the signal-validation outcome is known).
Reused as-is: `lib/galaxy-layout.ts` (`computeHomeLayout`), `galaxy-scene.tsx`/`galaxy-svg.tsx` rendering,
hop (`assertHopAllowed`), `/pitch` (kept exactly as-is — the interaction prototype, not something to
retire once real work starts).
Not touched: Direction A production build (demoted, not scoped unless separately justified), matching,
portraits, wander, `/sim`.

## Verification
- Signal validation (step 2) produces a written judgment — human-reviewed, not just "clusters looked
  reasonable" — on whether the chosen signal actually separates genre/scene, before any migration is
  written.
- `npx tsc --noEmit`, `npx next build`, once there's code to build.
- A destination's locked/reachable state matches the ranked-gateway query's result, independent of what
  happened to be in the viewer's most recent window render.
- Privacy: a profile with only private (`is_public = false`) picks in a scene never surfaces as that
  scene's gateway.
- RLS check: an anonymous/authenticated session can actually `select` from `song_scenes` /
  `song_scene_memberships` (i.e. the explicit policy exists and isn't just a grant), and cannot write to
  either as anything but `service_role`.
- End-to-end walkthrough (step 5-6) with a real seeded user: they see the one built destination, a real
  gateway, a real novel song with a real relevance explanation, can hop to the gateway, and the trail/
  fly-home transition works.
