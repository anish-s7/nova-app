-- Song scenes (docs/plans/galaxy-communities.md, Direction B): a stable registry of song-derived
-- musical communities, distinct from profiles.primary_cluster (an emotional "why", not a sound).
-- A clustering/tagging run PROPOSES memberships; this table is only ever written by a human-reviewed
-- publish step (service role), never overwritten wholesale by a batch job. Catalog-level data, like
-- `songs` itself: world-readable, writable only by service_role.
begin;

create table if not exists public.song_scenes (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  description text,
  status text not null default 'draft',
  centroid vector(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint song_scenes_status_valid check (status in ('draft', 'reviewed', 'published'))
);

-- Many-to-many: a song can genuinely belong to more than one scene (unlike primary_cluster, which is
-- deliberately winner-take-all for a single emotional "why"). `source` records which signal produced
-- this row ('musicbrainz_tag', 'embedding_fallback', 'manual') and `weight` how strongly it belongs —
-- distance/confidence direction matters, so this is `weight` (higher = stronger), never a raw distance.
create table if not exists public.song_scene_memberships (
  song_id uuid not null references public.songs(id) on delete cascade,
  scene_id uuid not null references public.song_scenes(id) on delete cascade,
  weight float not null,
  source text not null,
  model_version text,
  created_at timestamptz not null default now(),
  primary key (song_id, scene_id)
);

-- Denormalized for rendering convenience only (e.g. coloring a song by its strongest scene without a
-- join) — never the source of truth for membership; that's song_scene_memberships.
alter table public.songs add column if not exists primary_scene_id uuid references public.song_scenes(id);

alter table public.song_scenes enable row level security;
alter table public.song_scene_memberships enable row level security;

-- Explicit select policies: granting `select` to `authenticated` is not itself an RLS policy — with RLS
-- enabled, reads are denied by default until a policy allows them, regardless of the grant below.
drop policy if exists "Anyone signed in can read published scenes" on public.song_scenes;
create policy "Anyone signed in can read published scenes"
  on public.song_scenes for select
  to authenticated
  using (true);

drop policy if exists "Anyone signed in can read scene memberships" on public.song_scene_memberships;
create policy "Anyone signed in can read scene memberships"
  on public.song_scene_memberships for select
  to authenticated
  using (true);

revoke all on table public.song_scenes from anon, authenticated;
revoke all on table public.song_scene_memberships from anon, authenticated;
grant select on table public.song_scenes to authenticated;
grant select on table public.song_scene_memberships to authenticated;
grant select, insert, update, delete on table public.song_scenes to service_role;
grant select, insert, update, delete on table public.song_scene_memberships to service_role;

commit;
