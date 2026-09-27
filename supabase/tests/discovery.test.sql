begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create temporary table discovery_connection as
select * from public.configure_listening_connection(
  '11111111-1111-4111-8111-111111111111', 'listenbrainz',
  'discovery-fixture', 'listening-v1', '2026-09-27T12:00:00Z'
);
select public.set_listening_preferences(
  '11111111-1111-4111-8111-111111111111',
  (select connection_id from discovery_connection), 'America/New_York', 'balanced'
);

insert into public.taste_snapshots (
  id, profile_id, input_revision, algorithm_version, primary_connection_id,
  primary_source_generation, computed_as_of, timezone, coverage_state,
  total_plays, distinct_tracks, distinct_artists, observed_days, recent_7_plays, previous_7_plays
) values (
  'dddddddd-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
  1, 'artist-affinity-v1', (select connection_id from discovery_connection), 1,
  '2026-09-27T12:00:00Z', 'America/New_York', 'empty', 0, 0, 0, 0, 0, 0
);
insert into public.taste_interests (
  snapshot_id, profile_id, stable_interest_key, label, seed_artists, seed_tracks,
  recent_weight, core_weight, confidence, evidence_days, representative_tracks
) values (
  'dddddddd-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
  'artist:bon iver', 'Bon Iver', '[{"key":"bon iver","name":"Bon Iver"}]', '[]',
  0.6, 0.7, 0.8, 5, '[]'
);
update public.listening_preferences set active_taste_snapshot_id = 'dddddddd-1111-4111-8111-111111111111'
where profile_id = '11111111-1111-4111-8111-111111111111';

insert into public.songs (id, title, artist, fallback_key, resolution_source) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddd0001', 'Public Candidate', 'Bon Iver', 'public candidate::bon iver', 'gemini_fallback'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddd0002', 'Private Candidate', 'Bon Iver', 'private candidate::bon iver', 'gemini_fallback');
insert into public.song_picks (id, profile_id, song_id, tags, valence, energy, embedding, is_public) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddd1001', '22222222-2222-4222-8222-222222222222', 'dddddddd-dddd-4ddd-8ddd-dddddddd0001', array['comfort'], 0, 0, array_fill(0::real, array[770])::extensions.vector, true),
  ('dddddddd-dddd-4ddd-8ddd-dddddddd1002', '22222222-2222-4222-8222-222222222222', 'dddddddd-dddd-4ddd-8ddd-dddddddd0002', array['comfort'], 0, 0, array_fill(0::real, array[770])::extensions.vector, false);

create temporary table discovery_pool as
select * from public.discovery_catalog_candidates(
  '11111111-1111-4111-8111-111111111111', 'dddddddd-1111-4111-8111-111111111111', null, 300
);
select ok(exists(select 1 from discovery_pool where song_id = 'dddddddd-dddd-4ddd-8ddd-dddddddd0001'), 'public same-artist pick is eligible');
select ok(not exists(select 1 from discovery_pool where song_id = 'dddddddd-dddd-4ddd-8ddd-dddddddd0002'), 'private pick never enters the catalog pool');
select is((select path_type from discovery_pool where song_id = 'dddddddd-dddd-4ddd-8ddd-dddddddd0001' limit 1), 'same_artist', 'candidate retains an auditable path type');
select throws_ok(
  $$select * from public.discovery_catalog_candidates('11111111-1111-4111-8111-111111111111', 'dddddddd-1111-4111-8111-111111111111', null, 301)$$,
  '22023', 'invalid discovery candidate limit', 'retrieval refuses an unbounded limit'
);

create temporary table discovery_batch as
select public.publish_discovery_batch(
  '11111111-1111-4111-8111-111111111111', 'dddddddd-1111-4111-8111-111111111111', null, 1,
  'close', 'public-picks-v1', '2026-09-28T12:00:00Z',
  jsonb_build_array(jsonb_build_object(
    'songId', 'dddddddd-dddd-4ddd-8ddd-dddddddd0001', 'rank', 1, 'poolType', 'core',
    'interestKey', 'artist:bon iver', 'componentScores', jsonb_build_object('total', 0.7),
    'evidence', jsonb_build_object('kind', 'same_artist', 'artist', 'Bon Iver', 'interestKey', 'artist:bon iver', 'contributingPublicPickIds', jsonb_build_array('dddddddd-dddd-4ddd-8ddd-dddddddd1001')),
    'sourceAttribution', 'Public Song Galaxy picks'
  ))
) as id;
select is((select count(*) from public.discovery_candidates where batch_id = (select id from discovery_batch)), 1::bigint, 'batch publication stores its candidates atomically');
select is((select count(*) from public.song_picks where profile_id = '11111111-1111-4111-8111-111111111111'), 1::bigint, 'fixture starts with one explicit public pick');

create temporary table saved_revision as
select public.record_discovery_feedback(
  '11111111-1111-4111-8111-111111111111',
  (select id from public.discovery_candidates where batch_id = (select id from discovery_batch)),
  'save', 'save-fixture-0001'
) as revision;
select is((select count(*) from public.discovery_saves where profile_id = '11111111-1111-4111-8111-111111111111'), 1::bigint, 'save is stored in the private discovery collection');
select is((select count(*) from public.song_picks where profile_id = '11111111-1111-4111-8111-111111111111'), 1::bigint, 'saving a recommendation does not create a public pick');
select is((select revision from saved_revision), 2::bigint, 'strong feedback increments the discovery revision');
select throws_ok(
  format(
    $$select public.record_discovery_feedback('22222222-2222-4222-8222-222222222222', %L, 'dismiss', 'foreign-fixture-0001')$$,
    (select id from public.discovery_candidates where batch_id = (select id from discovery_batch))
  ),
  '42501', 'candidate does not belong to profile', 'feedback validates candidate ownership'
);

update public.song_picks set is_public = false where id = 'dddddddd-dddd-4ddd-8ddd-dddddddd1001';
select ok(not exists(select 1 from public.song_picks where id = 'dddddddd-dddd-4ddd-8ddd-dddddddd1001' and is_public), 'visibility can be revoked after a batch was cached for serve-time revalidation');

select * from finish();
rollback;
