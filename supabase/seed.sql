-- Local/demo-only identities. Password for both users: song-galaxy-demo
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'maya@song-galaxy.local',
    crypt('song-galaxy-demo', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Maya"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'theo@song-galaxy.local',
    crypt('song-galaxy-demo', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"display_name":"Theo"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
on conflict (id) do nothing;

insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    '{"sub":"11111111-1111-4111-8111-111111111111","email":"maya@song-galaxy.local","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '22222222-2222-4222-8222-222222222222',
    '{"sub":"22222222-2222-4222-8222-222222222222","email":"theo@song-galaxy.local","email_verified":true}'::jsonb,
    'email',
    now(),
    now(),
    now()
  )
on conflict (provider_id, provider) do nothing;

insert into public.profiles (id, display_name)
values
  ('11111111-1111-4111-8111-111111111111', 'Maya'),
  ('22222222-2222-4222-8222-222222222222', 'Theo')
on conflict (id) do update set display_name = excluded.display_name;

-- Shared catalog rows. Both resolved via the Gemini fallback path here
-- (no real MusicBrainz call in seed data) — mbid is null, fallback_key set.
insert into public.songs (
  id,
  title,
  artist,
  mbid,
  fallback_key,
  resolution_source,
  spotify_track_id,
  context_summary,
  embedding
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    'Holocene',
    'Bon Iver',
    null,
    'holocene::bon iver',
    'gemini_fallback',
    'demo-holocene',
    'A spacious, reflective song about feeling small but not alone.',
    (array[1::real, 0.2::real] || array_fill(0::real, array[766]))::extensions.vector
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    'Space Song',
    'Beach House',
    null,
    'space song::beach house',
    'gemini_fallback',
    'demo-space-song',
    'A dreamy, comforting song for processing a heavy day.',
    (array[0.95::real, 0.25::real] || array_fill(0::real, array[766]))::extensions.vector
  )
on conflict (id) do nothing;

-- One pick per user. embedding = the song's 768-dim vector + this pick's
-- valence/energy scaled by EMOTION_WEIGHT (5, see lib/emotion.ts) appended
-- as the final 2 dims — matches what app/api/picks/route.ts computes.
insert into public.song_picks (
  id,
  profile_id,
  song_id,
  tags,
  valence,
  energy,
  embedding,
  reason_text,
  is_public
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    array['late night', 'comfort'],
    -0.3,
    -0.5,
    (array[1::real, 0.2::real] || array_fill(0::real, array[766]) || array[-1.5::real, -2.5::real])::extensions.vector,
    'It makes lonely evenings feel spacious instead of empty.',
    true
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    '22222222-2222-4222-8222-222222222222',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    array['comfort', 'nostalgia'],
    -0.2,
    -0.4,
    (array[0.95::real, 0.25::real] || array_fill(0::real, array[766]) || array[-1.0::real, -2.0::real])::extensions.vector,
    'I listen when I need company while processing a difficult day.',
    true
  )
on conflict (id) do nothing;

insert into public.connection_cards (id, user_a, user_b, card_json)
values (
  'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '{
    "shared_why":"You both use dreamy, comforting music to sit with difficult feelings instead of avoiding them.",
    "evidence":{
      "user_a":"Holocene makes lonely evenings feel spacious instead of empty.",
      "user_b":"Space Song is company while processing a difficult day."
    },
    "difference":"Maya reaches for this feeling at night to feel less alone; Theo reaches for it right after a hard day to process it.",
    "openers":["What song makes a quiet evening feel less lonely for you?"],
    "suggested_swap_prompt":"Swap one song that feels like good company and say when you play it."
  }'::jsonb
)
on conflict (user_a, user_b) do nothing;

insert into public.messages (id, user_a, user_b, sender_id, body)
values (
  'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'What song makes a quiet evening feel less lonely for you?'
)
on conflict (id) do nothing;
