-- Song-specific tags. When a song is first described, Gemini writes 5–6 short tags for it
-- (lib/gemini/generateSongTags.ts), each tied to one of the five listening reasons (clusters).
-- Stored once per song, keyed by a normalized title + artist (lib/song-key.ts), because tags are
-- chosen on the feel step, before the song is saved to the catalog. Everyone who picks the song
-- sees the same tags. See POST /api/songs/tags.
begin;

create table if not exists public.song_tags (
  song_key text primary key,
  title text not null,
  artist text not null,
  -- [{ "label": "coming home changed", "why": "old_selves" }, ...]
  tags jsonb not null,
  model text not null,
  created_at timestamptz not null default now(),
  constraint song_tags_is_array check (jsonb_typeof(tags) = 'array')
);

alter table public.song_tags enable row level security;
create policy "Signed-in users can read song tags"
  on public.song_tags for select to authenticated using (true);

revoke all on table public.song_tags from anon, authenticated;
grant select on table public.song_tags to authenticated;
grant select, insert on table public.song_tags to service_role;

-- The listening reason behind each of a pick's tags (same order as tags). Empty for the original
-- fixed tags, which lib/cluster-assign.ts maps itself. Written by the backend on save.
alter table public.song_picks
  add column if not exists tag_whys text[] not null default '{}';

grant update (tag_whys) on table public.song_picks to service_role;

commit;
