begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now()
);

-- Shared catalog: one row per unique resolved song, not per user.
-- Identity resolves via MusicBrainz first (mbid set, fallback_key null),
-- Gemini as a fallback (fallback_key set, mbid null) — see CLAUDE.md.
create table public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 300),
  artist text not null check (length(btrim(artist)) between 1 and 300),
  mbid text,
  fallback_key text,
  resolution_source text not null check (resolution_source in ('musicbrainz', 'gemini_fallback')),
  spotify_track_id text,
  album_art_url text,
  context_summary text,
  embedding extensions.vector(768),
  created_at timestamptz not null default now(),
  constraint songs_identity_present check (mbid is not null or fallback_key is not null),
  constraint songs_spotify_track_id_not_blank
    check (spotify_track_id is null or length(btrim(spotify_track_id)) > 0)
);

create unique index songs_mbid_key on public.songs (mbid) where mbid is not null;
create unique index songs_fallback_key_key on public.songs (fallback_key) where fallback_key is not null;

-- One row per user per song pick. Each pick's embedding is computed once
-- at insert time (catalog song embedding + this pick's weighted
-- valence/energy) and never recomputed — matching is per-pick, not a
-- profile-level average. See CLAUDE.md / db/contract.md.
create table public.song_picks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  tags text[] not null check (coalesce(array_length(tags, 1), 0) between 1 and 3),
  valence real not null check (valence between -1 and 1),
  energy real not null check (energy between -1 and 1),
  embedding extensions.vector(770) not null,
  reason_text text check (reason_text is null or length(reason_text) <= 2000),
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.connection_cards (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  card_json jsonb not null,
  created_at timestamptz not null default now(),
  constraint connection_cards_canonical_pair check (user_a < user_b),
  constraint connection_cards_user_pair_key unique (user_a, user_b),
  constraint connection_cards_json_object check (jsonb_typeof(card_json) = 'object'),
  constraint connection_cards_json_shape check (
    card_json ?& array[
      'shared_why',
      'evidence',
      'difference',
      'openers',
      'suggested_swap_prompt'
    ]
  )
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint messages_canonical_pair check (user_a < user_b),
  constraint messages_sender_is_participant check (sender_id in (user_a, user_b))
);

create index songs_embedding_hnsw_idx
  on public.songs
  using hnsw (embedding extensions.vector_cosine_ops);

create index song_picks_profile_id_created_at_idx
  on public.song_picks (profile_id, created_at desc);

create index song_picks_song_id_idx
  on public.song_picks (song_id);

create index song_picks_embedding_hnsw_idx
  on public.song_picks
  using hnsw (embedding extensions.vector_cosine_ops);

create index connection_cards_user_b_idx
  on public.connection_cards (user_b);

create index messages_pair_created_at_idx
  on public.messages (user_a, user_b, created_at);

create index messages_user_b_created_at_idx
  on public.messages (user_b, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Song Galaxy user'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Per-pick candidate retrieval: for each candidate profile (other than the
-- target), finds their single best-matching public pick against any of the
-- target's picks. This is retrieval only — the backend's evidence-check
-- (lib/gemini/evaluateAndGenerateCard.ts) decides whether the pair is
-- actually shown, never this function. See CLAUDE.md / db/contract.md.
create or replace function public.match_picks(
  target_profile_id uuid,
  match_count integer default 10
)
returns table (
  profile_id uuid,
  display_name text,
  song_pick_id uuid,
  target_pick_id uuid,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with pairwise as (
    select
      candidate_profile.id as profile_id,
      candidate_profile.display_name,
      candidate_pick.id as song_pick_id,
      target_pick.id as target_pick_id,
      (1 - (candidate_pick.embedding <=> target_pick.embedding))::double precision as similarity,
      row_number() over (
        partition by candidate_profile.id
        order by candidate_pick.embedding <=> target_pick.embedding asc
      ) as rn
    from public.song_picks as target_pick
    cross join public.song_picks as candidate_pick
    join public.profiles as candidate_profile
      on candidate_profile.id = candidate_pick.profile_id
    where target_pick.profile_id = target_profile_id
      and candidate_pick.profile_id <> target_profile_id
      and candidate_pick.is_public = true
  )
  select profile_id, display_name, song_pick_id, target_pick_id, similarity
  from pairwise
  where rn = 1
  order by similarity desc, profile_id
  limit greatest(0, least(coalesce(match_count, 10), 100));
$$;

alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.song_picks enable row level security;
alter table public.connection_cards enable row level security;
alter table public.messages enable row level security;

create policy "Authenticated users can view profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- songs is a shared, de-duplicated catalog — every authenticated user can
-- read it, but only the backend (service role) inserts/updates it, so no
-- authenticated insert/update/delete policy is needed here.
create policy "Authenticated users can view the song catalog"
  on public.songs for select
  to authenticated
  using (true);

create policy "Users can view public or owned picks"
  on public.song_picks for select
  to authenticated
  using (is_public or profile_id = auth.uid());

create policy "Users can create their own picks"
  on public.song_picks for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "Users can update their own picks"
  on public.song_picks for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "Users can delete their own picks"
  on public.song_picks for delete
  to authenticated
  using (profile_id = auth.uid());

create policy "Participants can view connection cards"
  on public.connection_cards for select
  to authenticated
  using (auth.uid() in (user_a, user_b));

create policy "Participants can create connection cards"
  on public.connection_cards for insert
  to authenticated
  with check (auth.uid() in (user_a, user_b));

create policy "Participants can update connection cards"
  on public.connection_cards for update
  to authenticated
  using (auth.uid() in (user_a, user_b))
  with check (auth.uid() in (user_a, user_b));

create policy "Participants can view messages"
  on public.messages for select
  to authenticated
  using (auth.uid() in (user_a, user_b));

create policy "Participants can send messages as themselves"
  on public.messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and auth.uid() in (user_a, user_b)
  );

create policy "Senders can update their messages"
  on public.messages for update
  to authenticated
  using (sender_id = auth.uid())
  with check (
    sender_id = auth.uid()
    and auth.uid() in (user_a, user_b)
  );

create policy "Senders can delete their messages"
  on public.messages for delete
  to authenticated
  using (sender_id = auth.uid());

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.songs from anon, authenticated;
revoke all on table public.song_picks from anon, authenticated;
revoke all on table public.connection_cards from anon, authenticated;
revoke all on table public.messages from anon, authenticated;

grant select on table public.profiles to authenticated;
grant insert (id, display_name), update (display_name)
  on table public.profiles to authenticated;

grant select on table public.songs to authenticated;

grant select, insert, update, delete
  on table public.song_picks to authenticated;

grant select, insert on table public.connection_cards to authenticated;
grant update (card_json) on table public.connection_cards to authenticated;

grant select, insert, delete on table public.messages to authenticated;
grant update (body) on table public.messages to authenticated;

revoke all on function public.match_picks(uuid, integer) from public;
grant execute on function public.match_picks(uuid, integer) to authenticated, service_role;

alter table public.messages replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

commit;
