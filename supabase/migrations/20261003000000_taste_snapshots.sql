begin;

create table public.taste_snapshots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  input_revision bigint not null check (input_revision > 0),
  algorithm_version text not null check (length(algorithm_version) between 1 and 40),
  primary_connection_id uuid not null,
  primary_source_generation bigint not null check (primary_source_generation > 0),
  computed_as_of timestamptz not null,
  timezone text not null check (length(timezone) between 1 and 80),
  coverage_start date,
  coverage_end date,
  coverage_state text not null check (coverage_state in ('empty', 'short', 'established')),
  total_plays integer not null check (total_plays >= 0),
  distinct_tracks integer not null check (distinct_tracks >= 0),
  distinct_artists integer not null check (distinct_artists >= 0),
  observed_days integer not null check (observed_days >= 0),
  recent_7_plays integer not null check (recent_7_plays >= 0),
  previous_7_plays integer not null check (previous_7_plays >= 0),
  state text not null default 'ready' check (state = 'ready'),
  created_at timestamptz not null default now(),
  constraint taste_snapshots_profile_id_id_key unique (profile_id, id),
  constraint taste_snapshots_primary_owner_fk
    foreign key (profile_id, primary_connection_id)
    references public.listening_connections(profile_id, id)
    on delete cascade,
  constraint taste_snapshots_coverage_shape check (
    (coverage_state = 'empty' and coverage_start is null and coverage_end is null)
    or (coverage_state <> 'empty' and coverage_start is not null and coverage_end is not null and coverage_start <= coverage_end)
  )
);

create table public.taste_interests (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.taste_snapshots(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  stable_interest_key text not null check (length(stable_interest_key) between 1 and 500),
  label text not null check (length(label) between 1 and 500),
  seed_artists jsonb not null check (jsonb_typeof(seed_artists) = 'array' and jsonb_array_length(seed_artists) between 1 and 10),
  seed_tracks jsonb not null check (jsonb_typeof(seed_tracks) = 'array' and jsonb_array_length(seed_tracks) <= 10),
  recent_weight double precision not null check (recent_weight between 0 and 1),
  core_weight double precision not null check (core_weight between 0 and 1),
  confidence double precision not null check (confidence between 0 and 1),
  evidence_days integer not null check (evidence_days >= 0),
  representative_tracks jsonb not null check (jsonb_typeof(representative_tracks) = 'array' and jsonb_array_length(representative_tracks) <= 5),
  created_at timestamptz not null default now(),
  unique (snapshot_id, stable_interest_key),
  constraint taste_interests_snapshot_owner_fk
    foreign key (profile_id, snapshot_id)
    references public.taste_snapshots(profile_id, id)
    on delete cascade
);

alter table public.listening_preferences add column active_taste_snapshot_id uuid;
alter table public.listening_preferences add constraint listening_preferences_active_snapshot_owner_fk
  foreign key (profile_id, active_taste_snapshot_id)
  references public.taste_snapshots(profile_id, id)
  deferrable initially deferred;

create index taste_snapshots_profile_created_idx on public.taste_snapshots(profile_id, created_at desc);
create index taste_interests_snapshot_weight_idx on public.taste_interests(snapshot_id, core_weight desc);

-- One revision bump per newly dirtied local date, rather than one update per listen.
-- Publication also refuses to run while the selected source has active sync work.
create or replace function public.bump_listening_revision_for_dirty_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listening_preferences
  set input_revision = input_revision + 1, updated_at = clock_timestamp()
  where profile_id = new.profile_id and primary_connection_id = new.connection_id;
  return new;
end;
$$;

create trigger listening_dirty_dates_revision
  after insert on public.listening_dirty_dates
  for each row execute function public.bump_listening_revision_for_dirty_date();

create or replace function public.rebuild_listening_daily_tracks(
  p_profile_id uuid,
  p_connection_id uuid,
  p_connection_generation bigint,
  p_expected_input_revision bigint,
  p_as_of timestamptz
)
returns table (
  track_id uuid,
  title text,
  artist_credit text,
  artist_key text,
  local_date date,
  play_count integer,
  distinct_observed_timestamps integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preferences public.listening_preferences%rowtype;
  v_connection public.listening_connections%rowtype;
  v_as_of timestamptz := coalesce(p_as_of, clock_timestamp());
  v_cutoff date;
begin
  select * into v_preferences from public.listening_preferences
  where profile_id = p_profile_id for update;
  if not found or v_preferences.primary_connection_id is distinct from p_connection_id
     or v_preferences.input_revision <> p_expected_input_revision then
    raise exception using errcode = '40001', message = 'stale taste input revision or primary source';
  end if;

  select * into v_connection from public.listening_connections
  where id = p_connection_id and profile_id = p_profile_id for update;
  if not found or v_connection.status <> 'active'
     or v_connection.generation <> p_connection_generation then
    raise exception using errcode = '40001', message = 'stale taste source generation';
  end if;
  if exists (
    select 1 from public.listening_sync_jobs j where j.connection_id = p_connection_id
      and j.state in ('queued', 'running', 'retry_wait')
  ) then
    raise exception using errcode = '55000', message = 'selected listening source is still syncing';
  end if;

  v_cutoff := timezone(v_preferences.timezone, v_as_of)::date - v_preferences.raw_retention_days;
  delete from public.listening_daily_tracks d
  where d.profile_id = p_profile_id and d.connection_id = p_connection_id;

  insert into public.listening_daily_tracks (
    profile_id, connection_id, track_id, local_date, play_count,
    distinct_observed_timestamps, aggregation_revision
  )
  select p_profile_id, p_connection_id, e.track_id,
    timezone(v_preferences.timezone, e.played_at)::date,
    count(*)::integer, count(distinct e.played_at)::integer,
    p_expected_input_revision
  from public.listening_events e
  where e.profile_id = p_profile_id and e.connection_id = p_connection_id
    and e.connection_generation = p_connection_generation and not e.excluded
    and timezone(v_preferences.timezone, e.played_at)::date >= v_cutoff
  group by e.track_id, timezone(v_preferences.timezone, e.played_at)::date;

  delete from public.listening_dirty_dates d
  where d.profile_id = p_profile_id and d.connection_id = p_connection_id;

  return query
  select d.track_id, t.title, t.artist_credit, t.credited_artist_key,
    d.local_date, d.play_count, d.distinct_observed_timestamps
  from public.listening_daily_tracks d
  join public.listening_tracks t on t.id = d.track_id and t.profile_id = d.profile_id
  where d.profile_id = p_profile_id and d.connection_id = p_connection_id
    and d.aggregation_revision = p_expected_input_revision
  order by d.local_date desc, d.play_count desc, d.track_id;
end;
$$;

create or replace function public.publish_taste_snapshot(
  p_profile_id uuid,
  p_connection_id uuid,
  p_connection_generation bigint,
  p_expected_input_revision bigint,
  p_algorithm_version text,
  p_computed_as_of timestamptz,
  p_coverage_start date,
  p_coverage_end date,
  p_coverage_state text,
  p_total_plays integer,
  p_distinct_tracks integer,
  p_distinct_artists integer,
  p_observed_days integer,
  p_recent_7_plays integer,
  p_previous_7_plays integer,
  p_interests jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preferences public.listening_preferences%rowtype;
  v_connection public.listening_connections%rowtype;
  v_snapshot_id uuid;
  v_interest jsonb;
begin
  if jsonb_typeof(p_interests) <> 'array' or jsonb_array_length(p_interests) > 20 then
    raise exception using errcode = '22023', message = 'invalid taste interests';
  end if;
  select * into v_preferences from public.listening_preferences
  where profile_id = p_profile_id for update;
  select * into v_connection from public.listening_connections
  where id = p_connection_id and profile_id = p_profile_id for update;
  if v_preferences.primary_connection_id is distinct from p_connection_id
     or v_preferences.input_revision <> p_expected_input_revision
     or v_connection.status <> 'active'
     or v_connection.generation <> p_connection_generation then
    raise exception using errcode = '40001', message = 'stale taste snapshot publication';
  end if;
  if exists (
    select 1 from public.listening_sync_jobs j where j.connection_id = p_connection_id
      and j.state in ('queued', 'running', 'retry_wait')
  ) then
    raise exception using errcode = '55000', message = 'selected listening source is still syncing';
  end if;

  insert into public.taste_snapshots (
    profile_id, input_revision, algorithm_version, primary_connection_id,
    primary_source_generation, computed_as_of, timezone, coverage_start,
    coverage_end, coverage_state, total_plays, distinct_tracks, distinct_artists,
    observed_days, recent_7_plays, previous_7_plays
  ) values (
    p_profile_id, p_expected_input_revision, p_algorithm_version, p_connection_id,
    p_connection_generation, p_computed_as_of, v_preferences.timezone,
    p_coverage_start, p_coverage_end, p_coverage_state, p_total_plays,
    p_distinct_tracks, p_distinct_artists, p_observed_days,
    p_recent_7_plays, p_previous_7_plays
  ) returning id into v_snapshot_id;

  for v_interest in select value from jsonb_array_elements(p_interests)
  loop
    insert into public.taste_interests (
      snapshot_id, profile_id, stable_interest_key, label, seed_artists,
      seed_tracks, recent_weight, core_weight, confidence, evidence_days,
      representative_tracks
    ) values (
      v_snapshot_id, p_profile_id, v_interest ->> 'stableInterestKey',
      v_interest ->> 'label', v_interest -> 'seedArtists',
      coalesce(v_interest -> 'seedTracks', '[]'::jsonb),
      (v_interest ->> 'recentWeight')::double precision,
      (v_interest ->> 'coreWeight')::double precision,
      (v_interest ->> 'confidence')::double precision,
      (v_interest ->> 'evidenceDays')::integer,
      coalesce(v_interest -> 'representativeTracks', '[]'::jsonb)
    );
  end loop;

  update public.listening_preferences
  set active_taste_snapshot_id = v_snapshot_id, updated_at = clock_timestamp()
  where profile_id = p_profile_id;

  delete from public.taste_snapshots s
  where s.profile_id = p_profile_id and s.id <> v_snapshot_id and s.id in (
    select old.id from public.taste_snapshots old
    where old.profile_id = p_profile_id and old.id <> v_snapshot_id
    order by old.created_at desc offset 11
  );
  return v_snapshot_id;
end;
$$;

alter table public.taste_snapshots enable row level security;
alter table public.taste_interests enable row level security;
create policy "Owners can view taste snapshots" on public.taste_snapshots
  for select to authenticated using (profile_id = auth.uid());
create policy "Owners can view taste interests" on public.taste_interests
  for select to authenticated using (profile_id = auth.uid());
revoke all on table public.taste_snapshots from anon, authenticated;
revoke all on table public.taste_interests from anon, authenticated;
grant select on table public.taste_snapshots to authenticated;
grant select on table public.taste_interests to authenticated;
grant select, insert, update, delete on table public.taste_snapshots to service_role;
grant select, insert, update, delete on table public.taste_interests to service_role;

revoke all on function public.bump_listening_revision_for_dirty_date() from public;
revoke all on function public.rebuild_listening_daily_tracks(uuid, uuid, bigint, bigint, timestamptz) from public;
revoke all on function public.publish_taste_snapshot(uuid, uuid, bigint, bigint, text, timestamptz, date, date, text, integer, integer, integer, integer, integer, integer, jsonb) from public;
grant execute on function public.rebuild_listening_daily_tracks(uuid, uuid, bigint, bigint, timestamptz) to service_role;
grant execute on function public.publish_taste_snapshot(uuid, uuid, bigint, bigint, text, timestamptz, date, date, text, integer, integer, integer, integer, integer, integer, jsonb) to service_role;

commit;
