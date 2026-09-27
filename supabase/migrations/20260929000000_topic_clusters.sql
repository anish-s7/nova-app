-- Phase 1 (data model) of moving clusters off a hard-coded 5-value enum:
-- a real topic_clusters table, and profiles.primary_topic_cluster_id (uuid, FK) added next to
-- profiles.primary_cluster (text, DB-level check constraint), which is kept for now (see below).
-- Mirrors db/contract.md. `description` was added after Phase 1 landed, once
-- Phase 2 (the recompute job, scripts/recompute-topic-clusters.ts) needed
-- somewhere to put its Gemini-written cluster description — folded into this
-- same unapplied migration rather than a one-line patch migration on top.
--
-- Scope is still the data model: galaxy_pool / galaxy_cluster_counts
-- (supabase/migrations/20260927010000_galaxy_window.sql) and every app-side
-- reader of primary_cluster (lib/clusters.ts, lib/cluster-assign.ts,
-- lib/matching/findMatches.ts, lib/matching/galaxyWindow.ts, lib/real-api.ts,
-- lib/http-db.ts, scripts/seed-real-data.ts) still reference the old
-- column/text values and are updated in a later (app-wiring) phase, not here.
-- lib/supabase/types.ts and lib/matching/refreshPrimaryCluster.ts were
-- updated in Phase 2 to add the new shape alongside the old, so the new
-- recompute job and refreshPrimaryCluster can be written and type-check
-- today even though this migration isn't applied to the hosted project yet.
begin;

create table public.topic_clusters (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(btrim(label)) > 0),
  short text not null check (length(btrim(short)) > 0),
  -- Written by the recompute job's naming call (lib/gemini/nameTopicCluster.ts); the 5 seed rows
  -- below predate it and start without one.
  description text,
  color text not null check (length(btrim(color)) > 0),
  centroid extensions.vector(768),
  member_count int not null default 0 check (member_count >= 0),
  created_at timestamptz not null default now(),
  -- A cluster can be retired into a merged successor instead of just disappearing.
  superseded_by uuid references public.topic_clusters(id)
);

-- Seed with the current 5 clusters (lib/clusters.ts CLUSTER_IDS), promoted
-- from text ids to literal uuids, so nothing regresses on day one. The
-- recompute job takes over cluster membership/centroids from here.
insert into public.topic_clusters (id, label, short, description, color) values
  ('00000000-0000-4000-8000-000000000001', 'When it''s too quiet at home', 'Too quiet', 'You put something on so the room isn''t silent, usually late and usually alone.', '#c9a66b'),        -- quiet_company
  ('00000000-0000-4000-8000-000000000002', 'Armor for hard days', 'Hard days', 'What you play before the thing you''re dreading.', '#7fa9a3'),                 -- armor_up
  ('00000000-0000-4000-8000-000000000003', 'Songs for someone I miss', 'Missing someone', 'You go back to songs tied to a person, a place, or a time that''s gone.', '#9a8fbf'),      -- carrying_loss
  ('00000000-0000-4000-8000-000000000004', 'When I need to disappear for a bit', 'Disappearing', 'Headphones in, a few minutes somewhere else.', '#c48e96'), -- somewhere_else
  ('00000000-0000-4000-8000-000000000005', 'Songs that take me back', 'Taking me back', 'One song and you''re in a specific year again.', '#9db084');        -- old_selves

alter table public.profiles
  add column primary_topic_cluster_id uuid references public.topic_clusters(id);

update public.profiles set primary_topic_cluster_id = case primary_cluster
  when 'quiet_company' then '00000000-0000-4000-8000-000000000001'
  when 'armor_up' then '00000000-0000-4000-8000-000000000002'
  when 'carrying_loss' then '00000000-0000-4000-8000-000000000003'
  when 'somewhere_else' then '00000000-0000-4000-8000-000000000004'
  when 'old_selves' then '00000000-0000-4000-8000-000000000005'
  else null
end
where primary_cluster is not null;

update public.topic_clusters tc
  set member_count = (
    select count(*) from public.profiles p where p.primary_topic_cluster_id = tc.id
  );

-- Additive only (split 2026-09-27): profiles.primary_cluster and its check constraint STAY.
-- The galaxy RPCs (galaxy_pool / galaxy_cluster_counts) and several app readers (galaxyWindow,
-- findMatches, real-api, http-db) still read it, and lib/matching/refreshPrimaryCluster.ts keeps it
-- current alongside primary_topic_cluster_id during the transition. Dropping it is a separate,
-- later migration, written together with the app-wiring phase that moves those readers over:
--   alter table public.profiles drop constraint profiles_primary_cluster_valid;
--   alter table public.profiles drop column primary_cluster;

alter table public.topic_clusters enable row level security;

create policy "Authenticated users can view topic clusters"
  on public.topic_clusters for select
  to authenticated
  using (true);

grant select on table public.topic_clusters to authenticated;
grant select, insert, update on table public.topic_clusters to service_role;

commit;
