begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create temporary table configured as
select * from public.configure_listening_connection(
  '11111111-1111-4111-8111-111111111111',
  'listenbrainz',
  'fixture-listener',
  'listening-v1',
  '2026-09-27T12:00:00Z'
);

select is((select count(*) from configured), 1::bigint, 'configure returns a connection and job');
select is(
  (select canonical_username from public.listening_connections where id = (select connection_id from configured)),
  'fixture-listener',
  'configure stores only the canonical public username'
);
select is(
  (select range_upper - range_lower from public.listening_sync_jobs where id = (select job_id from configured)),
  interval '90 days',
  'initial import has a fixed 90-day range'
);
select is(
  (select primary_connection_id from public.listening_preferences where profile_id = '11111111-1111-4111-8111-111111111111'),
  (select connection_id from configured),
  'first source becomes primary'
);

create temporary table reconfigured as
select * from public.configure_listening_connection(
  '11111111-1111-4111-8111-111111111111',
  'listenbrainz',
  'renamed-listener',
  'listening-v1',
  '2026-09-27T13:00:00Z'
);

select is(
  (select generation from public.listening_connections where id = (select connection_id from reconfigured)),
  2::bigint,
  'username reconfiguration advances the source generation'
);
select is(
  (select state::text from public.listening_sync_jobs where id = (select job_id from configured)),
  'cancelled',
  'reconfiguration cancels prior work'
);
select is(
  (select count(*) from public.listening_sync_jobs where connection_id = (select connection_id from configured) and state in ('queued', 'running', 'retry_wait')),
  1::bigint,
  'only the replacement job remains active'
);

create temporary table claimed as
select * from public.claim_listening_job('2026-09-27T13:00:00Z');

select ok(
  public.disconnect_listening_connection('11111111-1111-4111-8111-111111111111', 'listenbrainz'),
  'disconnect finds and removes the configured source'
);
select is(
  (select primary_connection_id from public.listening_preferences where profile_id = '11111111-1111-4111-8111-111111111111'),
  null::uuid,
  'disconnect clears the selected primary source'
);
select throws_ok(
  format(
    $$select * from public.commit_listening_page(%L, %L, 2, 0, '[]'::jsonb, null, true)$$,
    (select id from claimed),
    (select lease_token from claimed)
  ),
  '40001',
  'stale listening job lease or checkpoint',
  'disconnect fences a fetch that was already in flight'
);

select * from finish();
rollback;
