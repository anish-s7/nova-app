begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create temporary table configured as
select * from public.configure_listening_connection(
  '11111111-1111-4111-8111-111111111111', 'listenbrainz',
  'taste-fixture', 'listening-v1', '2026-03-10T12:00:00Z'
);
select public.set_listening_preferences(
  '11111111-1111-4111-8111-111111111111',
  (select connection_id from configured), 'America/New_York', 'balanced'
);

create temporary table claimed as select * from public.claim_listening_job('2026-03-10T12:00:00Z');
select * from public.commit_listening_page(
  (select id from claimed), (select lease_token from claimed), 1, 0,
  jsonb_build_array(
    jsonb_build_object(
      'playedAtIso', '2026-03-08T04:30:00Z', 'idempotencyFingerprint', repeat('1', 64),
      'recording', jsonb_build_object('title', 'Before Spring', 'artistCredit', 'Clock Artist', 'artistKey', 'clock artist', 'identityFingerprint', repeat('a', 64))
    ),
    jsonb_build_object(
      'playedAtIso', '2026-03-08T07:30:00Z', 'idempotencyFingerprint', repeat('2', 64),
      'recording', jsonb_build_object('title', 'After Spring', 'artistCredit', 'Clock Artist', 'artistKey', 'clock artist', 'identityFingerprint', repeat('b', 64))
    ),
    jsonb_build_object(
      'playedAtIso', '2026-03-09T12:00:00Z', 'idempotencyFingerprint', repeat('3', 64),
      'recording', jsonb_build_object('title', 'Other Thread', 'artistCredit', 'Second Artist', 'artistKey', 'second artist', 'identityFingerprint', repeat('c', 64))
    )
  ), null, true
);

create temporary table aggregate_rows as
select * from public.rebuild_listening_daily_tracks(
  '11111111-1111-4111-8111-111111111111',
  (select connection_id from configured), 1,
  (select input_revision from public.listening_preferences where profile_id = '11111111-1111-4111-8111-111111111111'),
  '2026-03-10T12:00:00Z'
);

select results_eq(
  $$select distinct local_date from aggregate_rows order by local_date$$,
  $$values ('2026-03-07'::date), ('2026-03-08'::date), ('2026-03-09'::date)$$,
  'daily aggregation uses local calendar dates across the spring DST boundary'
);
select is((select count(*) from aggregate_rows), 3::bigint, 'all fixed-range listens are aggregated');
select is((select count(*) from public.listening_dirty_dates where connection_id = (select connection_id from configured)), 0::bigint, 'a complete rebuild consumes dirty dates');

create temporary table published as
select public.publish_taste_snapshot(
  '11111111-1111-4111-8111-111111111111',
  (select connection_id from configured), 1,
  (select input_revision from public.listening_preferences where profile_id = '11111111-1111-4111-8111-111111111111'),
  'artist-affinity-v1', '2026-03-10T12:00:00Z', '2026-03-07', '2026-03-09', 'short',
  3, 3, 2, 3, 3, 0,
  jsonb_build_array(jsonb_build_object(
    'stableInterestKey', 'artist:clock artist', 'label', 'Clock Artist',
    'seedArtists', jsonb_build_array(jsonb_build_object('key', 'clock artist', 'name', 'Clock Artist')),
    'seedTracks', '[]'::jsonb, 'recentWeight', 0.6, 'coreWeight', 0.6,
    'confidence', 0.5, 'evidenceDays', 2, 'representativeTracks', '[]'::jsonb
  ))
) as id;

select is((select count(*) from public.taste_snapshots), 1::bigint, 'publication creates one complete snapshot');
select is((select count(*) from public.taste_interests), 1::bigint, 'publication stores artist-led interests atomically');
select is(
  (select active_taste_snapshot_id from public.listening_preferences where profile_id = '11111111-1111-4111-8111-111111111111'),
  (select id from published),
  'publication swaps the active snapshot pointer'
);

create temporary table second_source as
select * from public.configure_listening_connection(
  '11111111-1111-4111-8111-111111111111', 'lastfm',
  'other-source', 'listening-v1', '2026-03-10T13:00:00Z'
);
select public.set_listening_preferences(
  '11111111-1111-4111-8111-111111111111',
  (select connection_id from second_source), 'America/New_York', 'balanced'
);

select throws_ok(
  format(
    $$select public.publish_taste_snapshot(
      '11111111-1111-4111-8111-111111111111', %L, 1, %s,
      'artist-affinity-v1', '2026-03-10T13:00:00Z', null, null, 'empty',
      0, 0, 0, 0, 0, 0, '[]'::jsonb
    )$$,
    (select connection_id from configured),
    (select input_revision - 1 from public.listening_preferences where profile_id = '11111111-1111-4111-8111-111111111111')
  ),
  '40001', 'stale taste snapshot publication',
  'switching the primary source fences an old publication'
);
select is((select count(*) from public.taste_snapshots), 1::bigint, 'a fenced publication leaves the previous complete snapshot intact');
select is(
  (select active_taste_snapshot_id from public.listening_preferences where profile_id = '11111111-1111-4111-8111-111111111111'),
  (select id from published),
  'source switching preserves the previous usable snapshot until replacement'
);

select * from finish();
rollback;
