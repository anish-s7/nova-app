-- Renames the five seeded topic clusters to Daniel's new labels (lib/clusters.ts, 2026-09-27).
-- 20260929000000_topic_clusters.sql was edited to the new labels after it had already been applied
-- to the hosted project, and editing an applied migration never reaches the database, so the live
-- rows kept the old names while the app (which reads labels from topic_clusters in real mode)
-- expects the new ones. Only rows still carrying a seed label are touched: a cluster the recompute
-- job has renamed since keeps its name.
begin;

update public.topic_clusters set label = 'Quiet & Solitude', short = 'Solitude',
  description = 'You put something on so the room isn''t silent, usually late and usually alone.'
  where id = '00000000-0000-4000-8000-000000000001' and label = 'When it''s too quiet at home';

update public.topic_clusters set label = 'Motivation & Focus', short = 'Motivation',
  description = 'What you play before something challenging or when you need energy.'
  where id = '00000000-0000-4000-8000-000000000002' and label = 'Armor for hard days';

update public.topic_clusters set label = 'Comfort & Longing', short = 'Comfort',
  description = 'You go back to songs tied to a person, a place, or a time that''s gone.'
  where id = '00000000-0000-4000-8000-000000000003' and label = 'Songs for someone I miss';

update public.topic_clusters set label = 'Escaping & Zoning Out', short = 'Zoning Out',
  description = 'Headphones in, taking a break from everything else.'
  where id = '00000000-0000-4000-8000-000000000004' and label = 'When I need to disappear for a bit';

update public.topic_clusters set label = 'Nostalgia & Memories', short = 'Nostalgia',
  description = 'One song and you''re in a specific year again.'
  where id = '00000000-0000-4000-8000-000000000005' and label = 'Songs that take me back';

commit;
