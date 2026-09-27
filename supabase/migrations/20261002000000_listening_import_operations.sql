begin;

-- Provider-wide reservations keep multiple worker processes from issuing bursts.
create table public.listening_provider_pacing (
  provider public.listening_provider primary key,
  not_before timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.listening_provider_pacing enable row level security;
revoke all on table public.listening_provider_pacing from anon, authenticated;
grant select, insert, update on table public.listening_provider_pacing to service_role;

create or replace function public.reserve_listening_provider_request(
  p_provider public.listening_provider,
  p_min_interval_ms integer
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_scheduled timestamptz;
begin
  if p_min_interval_ms < 0 or p_min_interval_ms > 60000 then
    raise exception using errcode = '22023', message = 'invalid provider pacing interval';
  end if;
  insert into public.listening_provider_pacing (provider, not_before)
  values (p_provider, v_now)
  on conflict (provider) do nothing;

  select greatest(not_before, v_now) into v_scheduled
  from public.listening_provider_pacing where provider = p_provider for update;

  update public.listening_provider_pacing
  set not_before = v_scheduled + make_interval(secs => p_min_interval_ms / 1000.0),
      updated_at = v_now
  where provider = p_provider;
  return v_scheduled;
end;
$$;

create or replace function public.configure_listening_connection(
  p_profile_id uuid,
  p_provider public.listening_provider,
  p_canonical_username text,
  p_consent_version text,
  p_now timestamptz
)
returns table (connection_id uuid, job_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.listening_connections%rowtype;
  v_connection_id uuid;
  v_job_id uuid;
  v_now timestamptz := coalesce(p_now, clock_timestamp());
begin
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception using errcode = '23503', message = 'profile not found';
  end if;
  if length(btrim(p_canonical_username)) not between 1 and 128
     or length(btrim(p_consent_version)) not between 1 and 40 then
    raise exception using errcode = '22023', message = 'invalid listening connection input';
  end if;

  select * into v_existing from public.listening_connections
  where profile_id = p_profile_id and provider = p_provider for update;

  if found then
    update public.listening_sync_jobs j set state = 'cancelled', lease_token = null,
      lease_expires_at = null, completed_at = v_now, updated_at = v_now
    where j.connection_id = v_existing.id and j.state in ('queued', 'running', 'retry_wait');

    if v_existing.canonical_username is distinct from btrim(p_canonical_username)
       or v_existing.status = 'disconnected' then
      delete from public.listening_daily_tracks d where d.connection_id = v_existing.id;
      delete from public.listening_dirty_dates d where d.connection_id = v_existing.id;
      delete from public.listening_events e where e.connection_id = v_existing.id;
      delete from public.listening_track_aliases where profile_id = p_profile_id and provider = p_provider;
      delete from public.listening_tracks t where t.profile_id = p_profile_id
        and not exists (select 1 from public.listening_events e where e.track_id = t.id);
    end if;

    update public.listening_connections
    set canonical_username = btrim(p_canonical_username), status = 'active',
        generation = case
          when v_existing.status = 'disconnected'
               and v_existing.canonical_username = btrim(p_canonical_username)
          then v_existing.generation + 1 else generation end,
        verification_state = 'unverified', consent_version = p_consent_version,
        consented_at = v_now, next_due_at = v_now, safe_error_code = null
    where id = v_existing.id returning id into v_connection_id;
  else
    insert into public.listening_connections (
      profile_id, provider, canonical_username, consent_version, consented_at, next_due_at
    ) values (
      p_profile_id, p_provider, btrim(p_canonical_username), p_consent_version, v_now, v_now
    ) returning id into v_connection_id;
  end if;

  insert into public.listening_preferences (profile_id, primary_connection_id)
  values (p_profile_id, v_connection_id)
  on conflict (profile_id) do update set
    primary_connection_id = coalesce(public.listening_preferences.primary_connection_id, excluded.primary_connection_id);

  insert into public.listening_sync_jobs (
    profile_id, connection_id, connection_generation, state, kind,
    range_lower, range_upper, next_attempt_at
  ) select p_profile_id, c.id, c.generation, 'queued', 'backfill',
      v_now - interval '90 days', v_now, v_now
    from public.listening_connections c where c.id = v_connection_id
  returning id into v_job_id;

  return query select v_connection_id, v_job_id;
end;
$$;

create or replace function public.enqueue_listening_sync(
  p_profile_id uuid,
  p_connection_id uuid,
  p_now timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.listening_connections%rowtype;
  v_job_id uuid;
  v_now timestamptz := coalesce(p_now, clock_timestamp());
begin
  select * into v_connection from public.listening_connections
  where id = p_connection_id and profile_id = p_profile_id and status = 'active' for update;
  if not found then raise exception using errcode = 'P0002', message = 'active listening connection not found'; end if;

  select id into v_job_id from public.listening_sync_jobs
  where connection_id = p_connection_id and state in ('queued', 'running', 'retry_wait')
  order by created_at desc limit 1;
  if v_job_id is not null then return v_job_id; end if;

  insert into public.listening_sync_jobs (
    profile_id, connection_id, connection_generation, state, kind,
    range_lower, range_upper, next_attempt_at
  ) values (
    p_profile_id, p_connection_id, v_connection.generation, 'queued',
    case when v_connection.last_successful_query_at is null then 'backfill'::public.listening_sync_kind
         else 'reconcile'::public.listening_sync_kind end,
    case when v_connection.last_successful_query_at is null then v_now - interval '90 days'
         else v_now - interval '48 hours' end,
    v_now, v_now
  ) returning id into v_job_id;
  return v_job_id;
end;
$$;

create or replace function public.disconnect_listening_connection(
  p_profile_id uuid,
  p_provider public.listening_provider
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.listening_connections%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_connection from public.listening_connections
  where profile_id = p_profile_id and provider = p_provider for update;
  if not found then return false; end if;

  -- Increment first: an HTTP fetch already in flight can no longer commit.
  update public.listening_connections set generation = generation + 1,
    status = 'disconnected', next_due_at = v_now, safe_error_code = null,
    last_successful_query_at = null, latest_observed_listen_at = null
  where id = v_connection.id;
  update public.listening_sync_jobs set state = 'cancelled', lease_token = null,
    lease_expires_at = null, completed_at = v_now, updated_at = v_now
  where connection_id = v_connection.id and state in ('queued', 'running', 'retry_wait');
  update public.listening_preferences set primary_connection_id = null
  where profile_id = p_profile_id and primary_connection_id = v_connection.id;
  delete from public.listening_daily_tracks where connection_id = v_connection.id;
  delete from public.listening_dirty_dates where connection_id = v_connection.id;
  delete from public.listening_events where connection_id = v_connection.id;
  delete from public.listening_track_aliases where profile_id = p_profile_id and provider = p_provider;
  delete from public.listening_tracks t where t.profile_id = p_profile_id
    and not exists (select 1 from public.listening_events e where e.track_id = t.id);
  return true;
end;
$$;

create or replace function public.set_listening_preferences(
  p_profile_id uuid,
  p_primary_connection_id uuid,
  p_timezone text,
  p_exploration_setting text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_primary_connection_id is not null and not exists (
    select 1 from public.listening_connections
    where id = p_primary_connection_id and profile_id = p_profile_id and status = 'active'
  ) then raise exception using errcode = '23503', message = 'primary connection does not belong to profile'; end if;
  insert into public.listening_preferences (
    profile_id, primary_connection_id, timezone, exploration_setting
  ) values (
    p_profile_id, p_primary_connection_id, coalesce(p_timezone, 'UTC'),
    coalesce(p_exploration_setting, 'balanced')
  ) on conflict (profile_id) do update set
    primary_connection_id = excluded.primary_connection_id,
    timezone = excluded.timezone,
    exploration_setting = excluded.exploration_setting;
end;
$$;

revoke all on function public.reserve_listening_provider_request(public.listening_provider, integer) from public;
revoke all on function public.configure_listening_connection(uuid, public.listening_provider, text, text, timestamptz) from public;
revoke all on function public.enqueue_listening_sync(uuid, uuid, timestamptz) from public;
revoke all on function public.disconnect_listening_connection(uuid, public.listening_provider) from public;
revoke all on function public.set_listening_preferences(uuid, uuid, text, text) from public;
grant execute on function public.reserve_listening_provider_request(public.listening_provider, integer) to service_role;
grant execute on function public.configure_listening_connection(uuid, public.listening_provider, text, text, timestamptz) to service_role;
grant execute on function public.enqueue_listening_sync(uuid, uuid, timestamptz) to service_role;
grant execute on function public.disconnect_listening_connection(uuid, public.listening_provider) to service_role;
grant execute on function public.set_listening_preferences(uuid, uuid, text, text) to service_role;

commit;
