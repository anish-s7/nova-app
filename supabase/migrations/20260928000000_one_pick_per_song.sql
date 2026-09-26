-- One pick per (profile, song). Re-picking a song you already have now updates that pick
-- (newest feelings win) instead of adding a duplicate row. See POST/PATCH/DELETE in
-- app/api/picks/route.ts.
--
-- ⚠️ Deletes existing duplicate picks (keeps the newest per profile + song). Nothing references
-- song_picks by foreign key; match/wander RPCs only use pick ids transiently.
begin;

-- 1. Remove duplicates, keeping each (profile, song)'s most recent pick.
delete from public.song_picks p
using (
  select id,
         row_number() over (partition by profile_id, song_id order by created_at desc, id desc) as rn
  from public.song_picks
) ranked
where p.id = ranked.id
  and ranked.rn > 1;

-- 2. When the pick's feelings last changed. Lets caches (portraits) notice edits even when the
--    number of picks stays the same.
alter table public.song_picks
  add column if not exists updated_at timestamptz not null default now();

update public.song_picks set updated_at = created_at;

-- 3. Enforce it from here on.
create unique index if not exists song_picks_profile_song_key
  on public.song_picks (profile_id, song_id);

-- 4. The backend (service role) can now edit a pick's feelings and remove picks. Column-scoped:
--    it still can't change ownership or which song a pick is for.
grant update (tags, valence, energy, embedding, reason_text, is_public, updated_at)
  on table public.song_picks to service_role;
grant delete on table public.song_picks to service_role;

-- 5. Portraits remember the newest pick change they were generated from, so an edit (same count)
--    still triggers a regeneration. Null for portraits made before this migration: treated as stale.
alter table public.profile_portraits
  add column if not exists picks_updated_at timestamptz;

commit;
