begin;

create type public.listening_provider as enum ('lastfm', 'listenbrainz');
create type public.listening_connection_status as enum ('active', 'error', 'disconnected');
create type public.listening_identity_status as enum ('unresolved', 'catalog_matched', 'ambiguous');
create type public.listening_sync_state as enum ('queued', 'running', 'retry_wait', 'complete', 'failed', 'cancelled');
create type public.listening_sync_kind as enum ('backfill', 'incremental', 'reconcile');

create table public.listening_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider public.listening_provider not null,
  canonical_username text not null check (length(btrim(canonical_username)) between 1 and 128),
  verification_state text not null default 'unverified' check (verification_state = 'unverified'),
  status public.listening_connection_status not null default 'active',
  generation bigint not null default 1 check (generation > 0),
  consent_version text not null check (length(btrim(consent_version)) between 1 and 40),
  consented_at timestamptz not null default now(),
  last_successful_query_at timestamptz,
  latest_observed_listen_at timestamptz,
  next_due_at timestamptz not null default now(),
  safe_error_code text check (safe_error_code is null or length(safe_error_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listening_connections_profile_provider_key unique (profile_id, provider),
  constraint listening_connections_profile_id_id_key unique (profile_id, id)
);

create table public.listening_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  primary_connection_id uuid,
  timezone text not null default 'UTC' check (length(timezone) between 1 and 80),
  exploration_setting text not null default 'balanced'
    check (exploration_setting in ('close', 'balanced', 'explore')),
  input_revision bigint not null default 1 check (input_revision > 0),
  raw_retention_days integer not null default 120 check (raw_retention_days between 90 and 365),
  updated_at timestamptz not null default now(),
  constraint listening_preferences_primary_owner_fk
    foreign key (profile_id, primary_connection_id)
    references public.listening_connections(profile_id, id)
    deferrable initially immediate
);

create table public.listening_tracks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 500),
  artist_credit text not null check (length(btrim(artist_credit)) between 1 and 500),
  credited_artist_key text not null check (length(credited_artist_key) between 1 and 500),
  album_hint text check (album_hint is null or length(album_hint) <= 500),
  version_hint text check (version_hint is null or length(version_hint) <= 300),
  identity_fingerprint text not null check (identity_fingerprint ~ '^[a-f0-9]{64}$'),
  catalog_song_id uuid references public.songs(id) on delete set null,
  identity_status public.listening_identity_status not null default 'unresolved',
  created_at timestamptz not null default now(),
  constraint listening_tracks_profile_fingerprint_key unique (profile_id, identity_fingerprint),
  constraint listening_tracks_profile_id_id_key unique (profile_id, id),
  constraint listening_tracks_catalog_state_check check (
    (identity_status = 'catalog_matched' and catalog_song_id is not null)
    or (identity_status <> 'catalog_matched')
  )
);

create table public.listening_track_aliases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider public.listening_provider not null,
  namespace text not null check (namespace in ('lastfm_fingerprint', 'musicbrainz_recording', 'listenbrainz_msid', 'listenbrainz_fingerprint')),
  identifier text not null check (length(btrim(identifier)) between 1 and 500),
  track_id uuid not null,
  resolution_method text not null check (resolution_method in ('provider_id', 'conservative_text', 'catalog_link')),
  provenance text not null check (length(btrim(provenance)) between 1 and 120),
  created_at timestamptz not null default now(),
  constraint listening_track_aliases_track_owner_fk
    foreign key (profile_id, track_id)
    references public.listening_tracks(profile_id, id)
    on delete cascade,
  constraint listening_track_aliases_identity_key unique (profile_id, provider, namespace, identifier)
);

create table public.listening_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null,
  connection_generation bigint not null check (connection_generation > 0),
  track_id uuid not null,
  played_at timestamptz not null,
  idempotency_fingerprint text not null check (idempotency_fingerprint ~ '^[a-f0-9]{64}$'),
  provider_event_id text check (provider_event_id is null or length(provider_event_id) <= 500),
  source_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_metadata) = 'object' and octet_length(source_metadata::text) <= 4096),
  excluded boolean not null default false,
  created_at timestamptz not null default now(),
  constraint listening_events_connection_owner_fk
    foreign key (profile_id, connection_id)
    references public.listening_connections(profile_id, id)
    on delete cascade,
  constraint listening_events_track_owner_fk
    foreign key (profile_id, track_id)
    references public.listening_tracks(profile_id, id)
    on delete cascade,
  constraint listening_events_source_identity_key
    unique (connection_id, connection_generation, idempotency_fingerprint)
);

create table public.listening_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null,
  connection_generation bigint not null check (connection_generation > 0),
  state public.listening_sync_state not null default 'queued',
  kind public.listening_sync_kind not null,
  range_lower timestamptz not null,
  range_upper timestamptz not null,
  continuation jsonb,
  checkpoint_revision bigint not null default 0 check (checkpoint_revision >= 0),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  pages_fetched integer not null default 0 check (pages_fetched >= 0),
  events_seen integer not null default 0 check (events_seen >= 0),
  events_inserted integer not null default 0 check (events_inserted >= 0),
  events_deduplicated integer not null default 0 check (events_deduplicated >= 0),
  safe_error_code text check (safe_error_code is null or length(safe_error_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint listening_sync_jobs_connection_owner_fk
    foreign key (profile_id, connection_id)
    references public.listening_connections(profile_id, id)
    on delete cascade,
  constraint listening_sync_jobs_range_check check (range_lower < range_upper),
  constraint listening_sync_jobs_lease_shape check (
    (state = 'running' and lease_token is not null and lease_expires_at is not null)
    or (state <> 'running' and lease_token is null and lease_expires_at is null)
  )
);

create unique index listening_sync_jobs_one_active_per_connection_idx
  on public.listening_sync_jobs (connection_id)
  where state in ('queued', 'running', 'retry_wait');

create table public.listening_daily_tracks (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null,
  track_id uuid not null,
  local_date date not null,
  play_count integer not null check (play_count >= 0),
  distinct_observed_timestamps integer not null check (distinct_observed_timestamps >= 0),
  aggregation_revision bigint not null check (aggregation_revision > 0),
  updated_at timestamptz not null default now(),
  primary key (profile_id, connection_id, track_id, local_date),
  constraint listening_daily_tracks_connection_owner_fk
    foreign key (profile_id, connection_id)
    references public.listening_connections(profile_id, id)
    on delete cascade,
  constraint listening_daily_tracks_track_owner_fk
    foreign key (profile_id, track_id)
    references public.listening_tracks(profile_id, id)
    on delete cascade
);

-- Internal invalidation queue. Dates are rebuilt from events; retries never increment totals.
create table public.listening_dirty_dates (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null,
  local_date date not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, connection_id, local_date),
  constraint listening_dirty_dates_connection_owner_fk
    foreign key (profile_id, connection_id)
    references public.listening_connections(profile_id, id)
    on delete cascade
);

create index listening_events_profile_played_at_idx
  on public.listening_events (profile_id, played_at desc);
create index listening_events_connection_played_at_idx
  on public.listening_events (connection_id, played_at desc);
create index listening_tracks_profile_artist_idx
  on public.listening_tracks (profile_id, credited_artist_key);
create index listening_sync_jobs_due_idx
  on public.listening_sync_jobs (next_attempt_at, created_at)
  where state in ('queued', 'retry_wait');

create or replace function public.validate_listening_timezone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise exception using errcode = '22023', message = 'invalid IANA timezone';
  end if;
  return new;
end;
$$;

create trigger listening_preferences_validate_timezone
  before insert or update of timezone on public.listening_preferences
  for each row execute function public.validate_listening_timezone();

create or replace function public.bump_listening_connection_generation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  if new.canonical_username is distinct from old.canonical_username then
    new.generation := old.generation + 1;
    new.last_successful_query_at := null;
    new.latest_observed_listen_at := null;
    new.safe_error_code := null;
    new.next_due_at := clock_timestamp();
  elsif new.generation < old.generation then
    raise exception using errcode = '22023', message = 'connection generation cannot decrease';
  end if;
  return new;
end;
$$;

create trigger listening_connections_generation_guard
  before update on public.listening_connections
  for each row execute function public.bump_listening_connection_generation();

create or replace function public.bump_listening_input_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  if new.primary_connection_id is distinct from old.primary_connection_id
     or new.timezone is distinct from old.timezone then
    new.input_revision := old.input_revision + 1;
  elsif new.input_revision < old.input_revision then
    raise exception using errcode = '22023', message = 'input revision cannot decrease';
  end if;
  return new;
end;
$$;

create trigger listening_preferences_revision_guard
  before update on public.listening_preferences
  for each row execute function public.bump_listening_input_revision();

create or replace function public.claim_listening_job(p_now timestamptz)
returns table (
  id uuid,
  profile_id uuid,
  connection_id uuid,
  connection_generation bigint,
  provider public.listening_provider,
  canonical_username text,
  kind public.listening_sync_kind,
  range_lower timestamptz,
  range_upper timestamptz,
  continuation jsonb,
  checkpoint_revision bigint,
  lease_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  -- p_now is an observability input only; lease validity always uses database time.
  if p_now is null then
    raise exception using errcode = '22023', message = 'claim time is required';
  end if;

  select j.id into v_job_id
  from public.listening_sync_jobs j
  join public.listening_connections c on c.id = j.connection_id
  where c.status = 'active'
    and c.generation = j.connection_generation
    and (
      (j.state in ('queued', 'retry_wait') and j.next_attempt_at <= v_now)
      or (j.state = 'running' and j.lease_expires_at <= v_now)
    )
  order by j.next_attempt_at, j.created_at
  for update of j skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  return query
  update public.listening_sync_jobs j
  set state = 'running',
      lease_token = gen_random_uuid(),
      lease_expires_at = v_now + interval '2 minutes',
      attempt_count = j.attempt_count + 1,
      updated_at = v_now
  from public.listening_connections c
  where j.id = v_job_id and c.id = j.connection_id
  returning j.id, j.profile_id, j.connection_id, j.connection_generation,
    c.provider, c.canonical_username, j.kind, j.range_lower, j.range_upper,
    j.continuation, j.checkpoint_revision, j.lease_token, j.lease_expires_at;
end;
$$;

create or replace function public.commit_listening_page(
  p_job_id uuid,
  p_lease_token uuid,
  p_connection_generation bigint,
  p_expected_checkpoint_revision bigint,
  p_events jsonb,
  p_next_continuation jsonb,
  p_range_complete boolean
)
returns table (inserted integer, duplicates integer, input_revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.listening_sync_jobs%rowtype;
  v_connection public.listening_connections%rowtype;
  v_event jsonb;
  v_track_id uuid;
  v_event_id uuid;
  v_inserted integer := 0;
  v_seen integer := 0;
  v_played_at timestamptz;
  v_timezone text;
  v_now timestamptz := clock_timestamp();
  v_revision bigint;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 1000 then
    raise exception using errcode = '22023', message = 'events must be an array of at most 1000 records';
  end if;

  select * into v_job from public.listening_sync_jobs where id = p_job_id for update;
  if not found or v_job.state <> 'running' or v_job.lease_token <> p_lease_token
     or v_job.lease_expires_at <= v_now
     or v_job.connection_generation <> p_connection_generation
     or v_job.checkpoint_revision <> p_expected_checkpoint_revision then
    raise exception using errcode = '40001', message = 'stale listening job lease or checkpoint';
  end if;

  select * into v_connection from public.listening_connections
  where id = v_job.connection_id for update;
  if not found or v_connection.status <> 'active'
     or v_connection.generation <> p_connection_generation then
    raise exception using errcode = '40001', message = 'stale listening connection generation';
  end if;

  select coalesce(p.timezone, 'UTC'), coalesce(p.input_revision, 1)
    into v_timezone, v_revision
  from public.profiles pr
  left join public.listening_preferences p on p.profile_id = pr.id
  where pr.id = v_job.profile_id;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    v_seen := v_seen + 1;
    v_track_id := null;
    if jsonb_typeof(v_event) <> 'object'
       or jsonb_typeof(v_event -> 'recording') <> 'object'
       or coalesce(v_event ->> 'idempotencyFingerprint', '') !~ '^[a-f0-9]{64}$'
       or coalesce(v_event -> 'recording' ->> 'identityFingerprint', '') !~ '^[a-f0-9]{64}$'
       or length(btrim(coalesce(v_event -> 'recording' ->> 'title', ''))) not between 1 and 500
       or length(btrim(coalesce(v_event -> 'recording' ->> 'artistCredit', ''))) not between 1 and 500
       or length(coalesce(v_event -> 'recording' ->> 'artistKey', '')) not between 1 and 500 then
      raise exception using errcode = '22023', message = 'invalid listening event payload';
    end if;

    begin
      v_played_at := (v_event ->> 'playedAtIso')::timestamptz;
    exception when others then
      raise exception using errcode = '22023', message = 'invalid listening event timestamp';
    end;
    if v_played_at < v_job.range_lower or v_played_at >= v_job.range_upper then
      raise exception using errcode = '22023', message = 'listening event outside fixed job range';
    end if;

    insert into public.listening_tracks (
      profile_id, title, artist_credit, credited_artist_key, album_hint,
      version_hint, identity_fingerprint, catalog_song_id, identity_status
    ) values (
      v_job.profile_id,
      btrim(v_event -> 'recording' ->> 'title'),
      btrim(v_event -> 'recording' ->> 'artistCredit'),
      v_event -> 'recording' ->> 'artistKey',
      nullif(btrim(v_event -> 'recording' ->> 'album'), ''),
      nullif(btrim(v_event -> 'recording' ->> 'versionHint'), ''),
      v_event -> 'recording' ->> 'identityFingerprint',
      nullif(v_event -> 'recording' ->> 'catalogSongId', '')::uuid,
      coalesce(nullif(v_event -> 'recording' ->> 'identityStatus', ''), 'unresolved')::public.listening_identity_status
    )
    on conflict (profile_id, identity_fingerprint) do nothing
    returning id into v_track_id;

    if v_track_id is null then
      select id into v_track_id from public.listening_tracks
      where profile_id = v_job.profile_id
        and identity_fingerprint = v_event -> 'recording' ->> 'identityFingerprint';
    end if;

    if jsonb_typeof(v_event -> 'alias') = 'object' then
      insert into public.listening_track_aliases (
        profile_id, provider, namespace, identifier, track_id, resolution_method, provenance
      ) values (
        v_job.profile_id,
        v_connection.provider,
        v_event -> 'alias' ->> 'namespace',
        v_event -> 'alias' ->> 'identifier',
        v_track_id,
        coalesce(nullif(v_event -> 'alias' ->> 'resolutionMethod', ''), 'provider_id'),
        coalesce(nullif(v_event -> 'alias' ->> 'provenance', ''), v_connection.provider::text)
      )
      on conflict (profile_id, provider, namespace, identifier) do update
        set track_id = excluded.track_id,
            resolution_method = excluded.resolution_method,
            provenance = excluded.provenance;
    end if;

    v_event_id := null;
    insert into public.listening_events (
      profile_id, connection_id, connection_generation, track_id, played_at,
      idempotency_fingerprint, provider_event_id, source_metadata
    ) values (
      v_job.profile_id, v_job.connection_id, p_connection_generation, v_track_id, v_played_at,
      v_event ->> 'idempotencyFingerprint',
      nullif(v_event ->> 'providerEventId', ''),
      coalesce(v_event -> 'sourceMetadata', '{}'::jsonb)
    )
    on conflict (connection_id, connection_generation, idempotency_fingerprint) do nothing
    returning id into v_event_id;

    if v_event_id is not null then
      v_inserted := v_inserted + 1;
      insert into public.listening_dirty_dates (profile_id, connection_id, local_date)
      values (v_job.profile_id, v_job.connection_id, timezone(v_timezone, v_played_at)::date)
      on conflict do nothing;
    end if;
  end loop;

  update public.listening_sync_jobs
  set continuation = case when p_range_complete then null else p_next_continuation end,
      checkpoint_revision = checkpoint_revision + 1,
      pages_fetched = pages_fetched + 1,
      events_seen = events_seen + v_seen,
      events_inserted = events_inserted + v_inserted,
      events_deduplicated = events_deduplicated + (v_seen - v_inserted),
      state = case when p_range_complete then 'complete'::public.listening_sync_state else state end,
      lease_token = case when p_range_complete then null else lease_token end,
      lease_expires_at = case when p_range_complete then null else lease_expires_at end,
      completed_at = case when p_range_complete then v_now else completed_at end,
      updated_at = v_now
  where id = p_job_id;

  update public.listening_connections
  set latest_observed_listen_at = greatest(latest_observed_listen_at, (
        select max(played_at) from public.listening_events where connection_id = v_job.connection_id
      )),
      last_successful_query_at = case when p_range_complete then v_now else last_successful_query_at end,
      safe_error_code = null,
      updated_at = v_now
  where id = v_job.connection_id;

  return query select v_inserted, v_seen - v_inserted, v_revision;
end;
$$;

create or replace function public.release_listening_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_connection_generation bigint,
  p_expected_checkpoint_revision bigint,
  p_next_attempt_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  update public.listening_sync_jobs j
  set state = 'queued', lease_token = null, lease_expires_at = null,
      next_attempt_at = greatest(coalesce(p_next_attempt_at, clock_timestamp()), clock_timestamp()),
      updated_at = clock_timestamp()
  from public.listening_connections c
  where j.id = p_job_id and c.id = j.connection_id
    and j.state = 'running' and j.lease_token = p_lease_token
    and j.connection_generation = p_connection_generation
    and j.checkpoint_revision = p_expected_checkpoint_revision
    and c.generation = p_connection_generation;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception using errcode = '40001', message = 'stale listening job release';
  end if;
end;
$$;

create or replace function public.fail_listening_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_connection_generation bigint,
  p_expected_checkpoint_revision bigint,
  p_retryable boolean,
  p_next_attempt_at timestamptz,
  p_safe_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_safe_error_code is null or length(p_safe_error_code) > 80 then
    raise exception using errcode = '22023', message = 'invalid safe error code';
  end if;
  update public.listening_sync_jobs j
  set state = case when p_retryable then 'retry_wait'::public.listening_sync_state else 'failed'::public.listening_sync_state end,
      lease_token = null, lease_expires_at = null,
      next_attempt_at = case when p_retryable then greatest(coalesce(p_next_attempt_at, clock_timestamp()), clock_timestamp()) else j.next_attempt_at end,
      safe_error_code = p_safe_error_code, updated_at = clock_timestamp()
  from public.listening_connections c
  where j.id = p_job_id and c.id = j.connection_id
    and j.state = 'running' and j.lease_token = p_lease_token
    and j.connection_generation = p_connection_generation
    and j.checkpoint_revision = p_expected_checkpoint_revision
    and c.generation = p_connection_generation;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception using errcode = '40001', message = 'stale listening job failure';
  end if;
end;
$$;

alter table public.listening_connections enable row level security;
alter table public.listening_preferences enable row level security;
alter table public.listening_tracks enable row level security;
alter table public.listening_track_aliases enable row level security;
alter table public.listening_events enable row level security;
alter table public.listening_sync_jobs enable row level security;
alter table public.listening_daily_tracks enable row level security;
alter table public.listening_dirty_dates enable row level security;

create policy "Owners can view listening connections" on public.listening_connections
  for select to authenticated using (profile_id = auth.uid());
create policy "Owners can view listening preferences" on public.listening_preferences
  for select to authenticated using (profile_id = auth.uid());
create policy "Owners can view listening tracks" on public.listening_tracks
  for select to authenticated using (profile_id = auth.uid());
create policy "Owners can view listening aliases" on public.listening_track_aliases
  for select to authenticated using (profile_id = auth.uid());
create policy "Owners can view listening events" on public.listening_events
  for select to authenticated using (profile_id = auth.uid());
create policy "Owners can view listening daily tracks" on public.listening_daily_tracks
  for select to authenticated using (profile_id = auth.uid());

revoke all on table public.listening_connections from anon, authenticated;
revoke all on table public.listening_preferences from anon, authenticated;
revoke all on table public.listening_tracks from anon, authenticated;
revoke all on table public.listening_track_aliases from anon, authenticated;
revoke all on table public.listening_events from anon, authenticated;
revoke all on table public.listening_sync_jobs from anon, authenticated;
revoke all on table public.listening_daily_tracks from anon, authenticated;
revoke all on table public.listening_dirty_dates from anon, authenticated;

grant select on table public.listening_connections to authenticated;
grant select on table public.listening_preferences to authenticated;
grant select on table public.listening_tracks to authenticated;
grant select on table public.listening_track_aliases to authenticated;
grant select on table public.listening_events to authenticated;
grant select on table public.listening_daily_tracks to authenticated;

grant select, insert, update, delete on table public.listening_connections to service_role;
grant select, insert, update, delete on table public.listening_preferences to service_role;
grant select, insert, update, delete on table public.listening_tracks to service_role;
grant select, insert, update, delete on table public.listening_track_aliases to service_role;
grant select, insert, update, delete on table public.listening_events to service_role;
grant select, insert, update, delete on table public.listening_sync_jobs to service_role;
grant select, insert, update, delete on table public.listening_daily_tracks to service_role;
grant select, insert, update, delete on table public.listening_dirty_dates to service_role;

revoke all on function public.validate_listening_timezone() from public;
revoke all on function public.bump_listening_connection_generation() from public;
revoke all on function public.bump_listening_input_revision() from public;
revoke all on function public.claim_listening_job(timestamptz) from public;
revoke all on function public.commit_listening_page(uuid, uuid, bigint, bigint, jsonb, jsonb, boolean) from public;
revoke all on function public.release_listening_job(uuid, uuid, bigint, bigint, timestamptz) from public;
revoke all on function public.fail_listening_job(uuid, uuid, bigint, bigint, boolean, timestamptz, text) from public;

grant execute on function public.claim_listening_job(timestamptz) to service_role;
grant execute on function public.commit_listening_page(uuid, uuid, bigint, bigint, jsonb, jsonb, boolean) to service_role;
grant execute on function public.release_listening_job(uuid, uuid, bigint, bigint, timestamptz) to service_role;
grant execute on function public.fail_listening_job(uuid, uuid, bigint, bigint, boolean, timestamptz, text) to service_role;

commit;
