> Saved 2026-09-26. Status (2026-09-27): **1. previews — done** (`cee5be6`); **2. song-specific
> tags — replaced** by fixed feeling tags (`e3e7336`; the AI-tags and picture-postcard experiments
> are on the `song-tags` / `postcards` branches, see CLAUDE.md "Tried and dropped"); **3. real swaps
> + bonds — next after Google OAuth**; **4. Stardust — moved to the backlog as a stretch goal.**

# Song previews, song-specific tags, real swaps + bonds, Stardust

## Decisions (from Anish)
- Tags: **AI-generated per song** (choice B), short (2–4 words) and specific to the song.
- Stardust: earned **only when both people swap** (a completed exchange). Anti-farming: yes;
  build the rules as config now, fill in the values later.
- Bonds: the link between two people gets **brighter the more they swap**.
- The rest of the team is redesigning the UI/theme: keep heavy work in the backend (`lib/`,
  `app/api/`, migrations) and keep screen edits small; list the UI files each step touches.
  The repo reorganization waits until the redesign has landed.

## 1. Song previews
- `GET /api/songs/search` returns each result's 30-second preview (Deezer `preview`, iTunes
  `previewUrl` as fallback). Preview links expire after a few hours: fetched fresh with each
  search, never stored.
- A play/pause button on each search result on the pick screen; one clip at a time; stops on
  pick or leaving. No button when a song has no preview (and in mock mode).
- Later: previews for songs already saved (profiles, galaxy) via an on-demand lookup.

## 2. Song-specific tags
- When a song enters the catalog, Gemini writes 5–6 short tags for it, each with the one of the
  five listening reasons (`lib/galaxy/clusters.ts`) it belongs to. Stored once on the `songs` row and
  shared by everyone who picks it (one call per new song).
- The feel step (and the galaxy "+") shows the song's tags instead of the fixed 10; pick 1–3.
- Clusters: `lib/galaxy/cluster-assign.ts` counts each tag's reason. Old picks keep their fixed tags
  (still mapped as today). A backfill script tags songs already in the catalog.
- The connection assessment sees the specific tags ("you both tapped *coming home changed*").

## 3. Real swaps + bonds
- `song_swaps`: sender, recipient, song (catalog row, resolved like a pick), note, and the swap it
  answers. The chat's swap screen and "swap back" write real rows.
- Bond strength = number of completed exchanges (A swaps, B swaps back). Levels (e.g. 1 at 1
  exchange … 5 at 10+) in one config; the galaxy link brightness reads the level.
- "You're bonded" celebrations use the real count, not browser-only counting.

## 4. Stardust
- Earned by both people when an exchange completes, written server-side to a ledger
  (`stardust_ledger`), never trusted from the browser. Balance shown with your star.
- Anti-farming in one config file, each rule switchable, placeholder values: daily cap per pair,
  daily cap per person, cooldown between rewarded exchanges, no reward for re-swapping a song.
- Store frame: `star_items` (name, type, price, design data — filled in by the designer),
  ownership, equipped item per slot; buy/equip go through the server. The star's look itself
  waits for the design.
