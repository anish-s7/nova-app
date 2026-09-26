begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 300),
  artist text not null check (length(btrim(artist)) between 1 and 300),
  spotify_track_id text,
  reason_text text not null check (length(reason_text) <= 2000),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  constraint songs_spotify_track_id_not_blank
    check (spotify_track_id is null or length(btrim(spotify_track_id)) > 0)
);

create table public.motivations (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  label text not null check (length(btrim(label)) between 1 and 200),
  embedding extensions.vector(768) not null,
  created_at timestamptz not null default now(),
  constraint motivations_song_label_key unique (song_id, label)
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

create index songs_profile_id_created_at_idx
  on public.songs (profile_id, created_at desc);

create index songs_profile_spotify_track_idx
  on public.songs (profile_id, spotify_track_id)
  where spotify_track_id is not null;

create index motivations_song_id_idx
  on public.motivations (song_id);

create index motivations_embedding_hnsw_idx
  on public.motivations
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

create or replace function public.match_profiles(
  target_profile_id uuid,
  match_count integer default 10
)
returns table (
  profile_id uuid,
  display_name text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    candidate_profile.id as profile_id,
    candidate_profile.display_name,
    max(1 - (candidate_motivation.embedding <=> target_motivation.embedding))::double precision as similarity
  from public.motivations as target_motivation
  join public.songs as target_song
    on target_song.id = target_motivation.song_id
  cross join public.motivations as candidate_motivation
  join public.songs as candidate_song
    on candidate_song.id = candidate_motivation.song_id
  join public.profiles as candidate_profile
    on candidate_profile.id = candidate_song.profile_id
  where target_song.profile_id = target_profile_id
    and candidate_song.profile_id <> target_profile_id
    and candidate_song.is_public = true
  group by candidate_profile.id, candidate_profile.display_name
  order by similarity desc, candidate_profile.id
  limit greatest(0, least(coalesce(match_count, 10), 100));
$$;

alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.motivations enable row level security;
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

create policy "Users can view public or owned songs"
  on public.songs for select
  to authenticated
  using (is_public or profile_id = auth.uid());

create policy "Users can create their own songs"
  on public.songs for insert
  to authenticated
  with check (profile_id = auth.uid());

create policy "Users can update their own songs"
  on public.songs for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "Users can delete their own songs"
  on public.songs for delete
  to authenticated
  using (profile_id = auth.uid());

create policy "Users can view motivations for visible songs"
  on public.motivations for select
  to authenticated
  using (
    exists (
      select 1
      from public.songs
      where songs.id = motivations.song_id
        and (songs.is_public or songs.profile_id = auth.uid())
    )
  );

create policy "Users can create motivations for their songs"
  on public.motivations for insert
  to authenticated
  with check (
    exists (
      select 1 from public.songs
      where songs.id = motivations.song_id
        and songs.profile_id = auth.uid()
    )
  );

create policy "Users can update motivations for their songs"
  on public.motivations for update
  to authenticated
  using (
    exists (
      select 1 from public.songs
      where songs.id = motivations.song_id
        and songs.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.songs
      where songs.id = motivations.song_id
        and songs.profile_id = auth.uid()
    )
  );

create policy "Users can delete motivations for their songs"
  on public.motivations for delete
  to authenticated
  using (
    exists (
      select 1 from public.songs
      where songs.id = motivations.song_id
        and songs.profile_id = auth.uid()
    )
  );

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
revoke all on table public.motivations from anon, authenticated;
revoke all on table public.connection_cards from anon, authenticated;
revoke all on table public.messages from anon, authenticated;

grant select on table public.profiles to authenticated;
grant insert (id, display_name), update (display_name)
  on table public.profiles to authenticated;

grant select, insert, update, delete
  on table public.songs to authenticated;
grant select, insert, update, delete
  on table public.motivations to authenticated;

grant select, insert on table public.connection_cards to authenticated;
grant update (card_json) on table public.connection_cards to authenticated;

grant select, insert, delete on table public.messages to authenticated;
grant update (body) on table public.messages to authenticated;

revoke all on function public.match_profiles(uuid, integer) from public;
grant execute on function public.match_profiles(uuid, integer) to authenticated, service_role;

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
