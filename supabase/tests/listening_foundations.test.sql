begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.listening_connections (
  id, profile_id, provider, canonical_username, consent_version
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', '11111111-1111-4111-8111-111111111111', 'lastfm', 'maya-fixture', 'listening-v1'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', '22222222-2222-4222-8222-222222222222', 'lastfm', 'theo-fixture', 'listening-v1');

insert into public.listening_preferences (profile_id, primary_connection_id, timezone)
values (
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'America/New_York'
);

select lives_ok(
  $$update public.listening_preferences set timezone = 'Europe/London'
    where profile_id = '11111111-1111-4111-8111-111111111111'$$,
  'valid IANA timezone is accepted'
);

select is(
  (select input_revision from public.listening_preferences
   where profile_id = '11111111-1111-4111-8111-111111111111'),
  2::bigint,
  'timezone changes advance the input revision'
);

select throws_ok(
  $$update public.listening_preferences
    set primary_connection_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
    where profile_id = '11111111-1111-4111-8111-111111111111'$$,
  '23503',
  null,
  'a primary connection must belong to the profile'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is(
  (select count(*) from public.listening_connections),
  1::bigint,
  'owner RLS hides another profile listening connection'
);
select throws_ok(
  $$insert into public.listening_connections
    (profile_id, provider, canonical_username, consent_version)
    values ('11111111-1111-4111-8111-111111111111', 'listenbrainz', 'blocked', 'listening-v1')$$,
  '42501',
  null,
  'authenticated clients cannot mutate listening connections directly'
);
reset role;

insert into public.listening_sync_jobs (
  id, profile_id, connection_id, connection_generation, kind, range_lower, range_upper
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  1,
  'backfill',
  '2026-09-01T00:00:00Z',
  '2026-10-01T00:00:00Z'
);

create temporary table first_claim as
select * from public.claim_listening_job(clock_timestamp());

select is((select count(*) from first_claim), 1::bigint, 'a due job is claimed');
select ok((select lease_token is not null from first_claim), 'claim assigns a random lease');

create temporary table first_commit as
select * from public.commit_listening_page(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  (select lease_token from first_claim),
  1,
  0,
  jsonb_build_array(jsonb_build_object(
    'playedAtIso', '2026-09-10T12:00:00Z',
    'idempotencyFingerprint', repeat('a', 64),
    'recording', jsonb_build_object(
      'title', 'Glass Harbor',
      'artistCredit', 'North Meridian',
      'artistKey', 'north meridian',
      'identityFingerprint', repeat('b', 64)
    )
  )),
  jsonb_build_object('provider', 'lastfm', 'page', 2),
  false
);

select is((select inserted from first_commit), 1, 'first page commit inserts the listen');

create temporary table replay_commit as
select * from public.commit_listening_page(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  (select lease_token from first_claim),
  1,
  1,
  jsonb_build_array(jsonb_build_object(
    'playedAtIso', '2026-09-10T12:00:00Z',
    'idempotencyFingerprint', repeat('a', 64),
    'recording', jsonb_build_object(
      'title', 'Glass Harbor',
      'artistCredit', 'North Meridian',
      'artistKey', 'north meridian',
      'identityFingerprint', repeat('b', 64)
    )
  )),
  null,
  true
);

select results_eq(
  $$select inserted, duplicates from replay_commit$$,
  $$values (0, 1)$$,
  'replaying the page reports one duplicate and inserts nothing'
);

insert into public.listening_sync_jobs (
  id, profile_id, connection_id, connection_generation, state, kind, range_lower, range_upper,
  lease_token, lease_expires_at, attempt_count
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  '11111111-1111-4111-8111-111111111111',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  1,
  'running',
  'incremental',
  '2026-09-01T00:00:00Z',
  '2026-10-01T00:00:00Z',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  clock_timestamp() - interval '1 minute',
  1
);

create temporary table recovered_claim as
select * from public.claim_listening_job(clock_timestamp());
select isnt(
  (select lease_token from recovered_claim),
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid,
  'an expired lease is recovered with a different token'
);
select is(
  (select attempt_count from public.listening_sync_jobs
   where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'),
  2,
  'lease recovery increments the attempt count'
);

update public.listening_connections
set canonical_username = 'maya-reconfigured'
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

select throws_ok(
  format(
    $$select * from public.commit_listening_page(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', %L, 1, 0, '[]'::jsonb, null, true
    )$$,
    (select lease_token from recovered_claim)
  ),
  '40001',
  'stale listening connection generation',
  'a username reconfiguration fences an in-flight page'
);

select * from finish();
rollback;
