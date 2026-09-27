begin;

alter table public.listening_preferences
  add column discovery_feedback_revision bigint not null default 1 check (discovery_feedback_revision > 0);

create table public.discovery_batches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  taste_snapshot_id uuid not null,
  anchor_song_id uuid references public.songs(id) on delete set null,
  public_catalog_revision timestamptz,
  feedback_revision bigint not null check (feedback_revision > 0),
  exploration_mode text not null check (exploration_mode in ('close', 'explore')),
  algorithm_version text not null check (length(algorithm_version) between 1 and 40),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint discovery_batches_expiry_check check (expires_at > created_at),
  constraint discovery_batches_profile_id_id_key unique (profile_id, id),
  constraint discovery_batches_snapshot_owner_fk
    foreign key (profile_id, taste_snapshot_id)
    references public.taste_snapshots(profile_id, id)
    on delete cascade
);

create table public.discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  rank integer not null check (rank between 1 and 300),
  pool_type text not null check (pool_type in ('core', 'current', 'bridge', 'rediscovery')),
  interest_key text,
  component_scores jsonb not null check (jsonb_typeof(component_scores) = 'object'),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  source_attribution text not null check (length(source_attribution) between 1 and 120),
  created_at timestamptz not null default now(),
  constraint discovery_candidates_batch_owner_fk
    foreign key (profile_id, batch_id)
    references public.discovery_batches(profile_id, id)
    on delete cascade,
  unique (batch_id, song_id),
  unique (batch_id, rank),
  constraint discovery_candidates_profile_id_id_key unique (profile_id, id)
);

create table public.discovery_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  candidate_id uuid not null,
  batch_id uuid not null,
  action text not null check (action in ('impression', 'preview_start', 'outbound_click', 'save', 'dismiss', 'not_now', 'more_like', 'hide_artist')),
  client_idempotency_key text not null check (length(client_idempotency_key) between 8 and 100),
  created_at timestamptz not null default now(),
  constraint discovery_events_candidate_owner_fk
    foreign key (profile_id, candidate_id)
    references public.discovery_candidates(profile_id, id)
    on delete cascade,
  constraint discovery_events_batch_owner_fk
    foreign key (profile_id, batch_id)
    references public.discovery_batches(profile_id, id)
    on delete cascade,
  unique (profile_id, client_idempotency_key)
);

create table public.discovery_saves (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  candidate_id uuid,
  created_at timestamptz not null default now(),
  primary key (profile_id, song_id),
  constraint discovery_saves_candidate_owner_fk
    foreign key (profile_id, candidate_id)
    references public.discovery_candidates(profile_id, id)
    on delete set null (candidate_id)
);

create index discovery_batches_profile_expiry_idx on public.discovery_batches(profile_id, expires_at desc);
create index discovery_candidates_batch_rank_idx on public.discovery_candidates(batch_id, rank);
create index discovery_events_profile_created_idx on public.discovery_events(profile_id, created_at desc);

create or replace function public.discovery_catalog_candidates(
  p_profile_id uuid,
  p_taste_snapshot_id uuid,
  p_anchor_song_id uuid default null,
  p_limit integer default 300
)
returns table (
  song_id uuid,
  title text,
  artist text,
  album_art_url text,
  spotify_track_id text,
  path_type text,
  interest_key text,
  interest_weight double precision,
  anchor_song_id uuid,
  public_pick_id uuid,
  contributor_profile_id uuid,
  repeat_days integer,
  anchor_strength double precision,
  listening_track_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit < 1 or p_limit > 300 then
    raise exception using errcode = '22023', message = 'invalid discovery candidate limit';
  end if;
  if not exists (
    select 1 from public.taste_snapshots s
    join public.listening_preferences p on p.profile_id = s.profile_id and p.active_taste_snapshot_id = s.id
    where s.id = p_taste_snapshot_id and s.profile_id = p_profile_id
  ) then raise exception using errcode = '42501', message = 'taste snapshot is not active for profile'; end if;
  if p_anchor_song_id is not null and not exists (
    select 1 from public.song_picks p
    where p.song_id = p_anchor_song_id and (p.profile_id = p_profile_id or p.is_public)
  ) then raise exception using errcode = '42501', message = 'anchor song is not visible'; end if;

  return query
  with interests as (
    select i.stable_interest_key,
      lower(regexp_replace(coalesce(i.seed_artists -> 0 ->> 'key', i.seed_artists -> 0 ->> 'name', i.label), '\s+', ' ', 'g')) as artist_key,
      greatest(i.recent_weight, i.core_weight)::double precision as weight
    from public.taste_interests i
    where i.snapshot_id = p_taste_snapshot_id and i.profile_id = p_profile_id
  ),
  known_songs as (
    select p.song_id from public.song_picks p where p.profile_id = p_profile_id
    union
    select t.catalog_song_id from public.listening_tracks t
    join public.listening_preferences pref on pref.profile_id = p_profile_id
    where t.profile_id = p_profile_id and t.catalog_song_id is not null
  ),
  anchor_people as (
    select p.profile_id, p.id as anchor_pick_id,
      count(*) over (partition by p.song_id)::integer as anchor_popularity
    from public.song_picks p
    where p_anchor_song_id is not null and p.song_id = p_anchor_song_id and p.is_public
      and p.profile_id <> p_profile_id
  ),
  anchor_ranked as (
    select candidate.song_id, candidate.id as public_pick_id, candidate.profile_id,
      ap.anchor_pick_id, ap.anchor_popularity,
      row_number() over (partition by candidate.profile_id order by candidate.updated_at desc, candidate.id) as person_rank
    from anchor_people ap
    join public.song_picks candidate on candidate.profile_id = ap.profile_id
      and candidate.is_public and candidate.song_id <> p_anchor_song_id
  ),
  overlap_people as (
    select shared.profile_id, mine.song_id as anchor_song_id, shared.id as shared_pick_id,
      count(*) over (partition by mine.song_id)::integer as anchor_popularity
    from public.song_picks mine
    join public.song_picks shared on shared.song_id = mine.song_id and shared.is_public
      and shared.profile_id <> p_profile_id
    where mine.profile_id = p_profile_id
  ),
  overlap_ranked as (
    select candidate.song_id, candidate.id as public_pick_id, candidate.profile_id,
      op.anchor_song_id, op.shared_pick_id, op.anchor_popularity,
      row_number() over (partition by candidate.profile_id order by candidate.updated_at desc, candidate.id) as person_rank
    from overlap_people op
    join public.song_picks candidate on candidate.profile_id = op.profile_id
      and candidate.is_public and candidate.song_id <> op.anchor_song_id
  ),
  paths as (
    select ar.song_id, 'shared_public_pick'::text as path_type, null::text as interest_key,
      0::double precision as interest_weight, p_anchor_song_id as anchor_song_id,
      evidence_pick.id as public_pick_id, ar.profile_id as contributor_profile_id,
      0::integer as repeat_days, (1.0 / sqrt(greatest(1, ar.anchor_popularity)))::double precision as anchor_strength,
      null::uuid as listening_track_id
    from anchor_ranked ar
    cross join lateral (values (ar.anchor_pick_id), (ar.public_pick_id)) as evidence_pick(id)
    where ar.person_rank <= 5
    union all
    select p.song_id, 'same_artist', i.stable_interest_key, i.weight,
      null, p.id, p.profile_id, 0, 0.45::double precision, null
    from interests i
    join public.songs s on lower(regexp_replace(s.artist, '\s+', ' ', 'g')) = i.artist_key
    join public.song_picks p on p.song_id = s.id and p.is_public
    union all
    select o.song_id, 'public_overlap', null, 0, o.anchor_song_id,
      evidence_pick.id as public_pick_id, o.profile_id, 0,
      (0.8 / sqrt(greatest(1, o.anchor_popularity)))::double precision, null
    from overlap_ranked o
    cross join lateral (values (o.shared_pick_id), (o.public_pick_id)) as evidence_pick(id)
    where o.person_rank <= 5
    union all
    select t.catalog_song_id, 'own_rediscovery', null, 0, null, null, null,
      count(distinct timezone(pref.timezone, e.played_at)::date)::integer,
      0.35::double precision, t.id
    from public.listening_preferences pref
    join public.listening_connections c on c.id = pref.primary_connection_id and c.profile_id = pref.profile_id
    join public.listening_events e on e.connection_id = c.id and e.connection_generation = c.generation and not e.excluded
    join public.listening_tracks t on t.id = e.track_id and t.catalog_song_id is not null
    where pref.profile_id = p_profile_id
    group by t.catalog_song_id, t.id
  )
  select s.id, s.title, s.artist, s.album_art_url, s.spotify_track_id,
    paths.path_type, paths.interest_key, paths.interest_weight,
    paths.anchor_song_id, paths.public_pick_id, paths.contributor_profile_id,
    paths.repeat_days, paths.anchor_strength, paths.listening_track_id
  from paths join public.songs s on s.id = paths.song_id
  where paths.path_type = 'own_rediscovery'
     or not exists (select 1 from known_songs k where k.song_id = paths.song_id)
  order by paths.anchor_strength desc, paths.interest_weight desc, paths.song_id
  limit p_limit;
end;
$$;

create or replace function public.publish_discovery_batch(
  p_profile_id uuid,
  p_taste_snapshot_id uuid,
  p_anchor_song_id uuid,
  p_feedback_revision bigint,
  p_exploration_mode text,
  p_algorithm_version text,
  p_expires_at timestamptz,
  p_candidates jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preferences public.listening_preferences%rowtype;
  v_batch_id uuid;
  v_candidate jsonb;
  v_catalog_revision timestamptz;
begin
  if p_exploration_mode not in ('close', 'explore')
     or jsonb_typeof(p_candidates) <> 'array' or jsonb_array_length(p_candidates) > 24
     or p_expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'invalid discovery batch';
  end if;
  select * into v_preferences from public.listening_preferences
  where profile_id = p_profile_id for update;
  if v_preferences.active_taste_snapshot_id is distinct from p_taste_snapshot_id
     or v_preferences.discovery_feedback_revision <> p_feedback_revision then
    raise exception using errcode = '40001', message = 'stale discovery batch inputs';
  end if;
  select max(p.updated_at) into v_catalog_revision from public.song_picks p where p.is_public;
  insert into public.discovery_batches (
    profile_id, taste_snapshot_id, anchor_song_id, public_catalog_revision, feedback_revision,
    exploration_mode, algorithm_version, expires_at
  ) values (
    p_profile_id, p_taste_snapshot_id, p_anchor_song_id, v_catalog_revision, p_feedback_revision,
    p_exploration_mode, p_algorithm_version, p_expires_at
  ) returning id into v_batch_id;

  for v_candidate in select value from jsonb_array_elements(p_candidates)
  loop
    insert into public.discovery_candidates (
      batch_id, profile_id, song_id, rank, pool_type, interest_key,
      component_scores, evidence, source_attribution
    ) values (
      v_batch_id, p_profile_id, (v_candidate ->> 'songId')::uuid,
      (v_candidate ->> 'rank')::integer, v_candidate ->> 'poolType',
      nullif(v_candidate ->> 'interestKey', ''), v_candidate -> 'componentScores',
      v_candidate -> 'evidence', v_candidate ->> 'sourceAttribution'
    );
  end loop;
  delete from public.discovery_batches b where b.profile_id = p_profile_id and b.id <> v_batch_id and b.id in (
    select old.id from public.discovery_batches old where old.profile_id = p_profile_id
    order by old.created_at desc offset 7
  );
  return v_batch_id;
end;
$$;

create or replace function public.record_discovery_feedback(
  p_profile_id uuid,
  p_candidate_id uuid,
  p_action text,
  p_client_idempotency_key text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate public.discovery_candidates%rowtype;
  v_inserted uuid;
  v_revision bigint;
begin
  if p_action not in ('impression', 'preview_start', 'outbound_click', 'save', 'dismiss', 'not_now', 'more_like', 'hide_artist')
     or length(p_client_idempotency_key) not between 8 and 100 then
    raise exception using errcode = '22023', message = 'invalid discovery feedback';
  end if;
  select * into v_candidate from public.discovery_candidates
  where id = p_candidate_id and profile_id = p_profile_id;
  if not found then raise exception using errcode = '42501', message = 'candidate does not belong to profile'; end if;
  insert into public.discovery_events (
    profile_id, candidate_id, batch_id, action, client_idempotency_key
  ) values (
    p_profile_id, v_candidate.id, v_candidate.batch_id, p_action, p_client_idempotency_key
  ) on conflict (profile_id, client_idempotency_key) do nothing returning id into v_inserted;
  if v_inserted is not null then
    if p_action = 'save' then
      insert into public.discovery_saves (profile_id, song_id, candidate_id)
      values (p_profile_id, v_candidate.song_id, v_candidate.id)
      on conflict (profile_id, song_id) do update set candidate_id = excluded.candidate_id;
    end if;
    if p_action in ('save', 'dismiss', 'not_now', 'more_like', 'hide_artist') then
      update public.listening_preferences set discovery_feedback_revision = discovery_feedback_revision + 1,
        updated_at = clock_timestamp() where profile_id = p_profile_id
      returning discovery_feedback_revision into v_revision;
    end if;
  end if;
  if v_revision is null then
    select discovery_feedback_revision into v_revision from public.listening_preferences where profile_id = p_profile_id;
  end if;
  return v_revision;
end;
$$;

alter table public.discovery_batches enable row level security;
alter table public.discovery_candidates enable row level security;
alter table public.discovery_events enable row level security;
alter table public.discovery_saves enable row level security;
create policy "Owners can view discovery batches" on public.discovery_batches for select to authenticated using (profile_id = auth.uid());
create policy "Owners can view discovery candidates" on public.discovery_candidates for select to authenticated using (profile_id = auth.uid());
create policy "Owners can view discovery events" on public.discovery_events for select to authenticated using (profile_id = auth.uid());
create policy "Owners can view discovery saves" on public.discovery_saves for select to authenticated using (profile_id = auth.uid());
revoke all on table public.discovery_batches, public.discovery_candidates, public.discovery_events, public.discovery_saves from anon, authenticated;
grant select on table public.discovery_batches, public.discovery_candidates, public.discovery_events, public.discovery_saves to authenticated;
grant select, insert, update, delete on table public.discovery_batches, public.discovery_candidates, public.discovery_events, public.discovery_saves to service_role;
revoke all on function public.discovery_catalog_candidates(uuid, uuid, uuid, integer) from public;
revoke all on function public.publish_discovery_batch(uuid, uuid, uuid, bigint, text, text, timestamptz, jsonb) from public;
revoke all on function public.record_discovery_feedback(uuid, uuid, text, text) from public;
grant execute on function public.discovery_catalog_candidates(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.publish_discovery_batch(uuid, uuid, uuid, bigint, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.record_discovery_feedback(uuid, uuid, text, text) to service_role;

commit;
