-- Galaxy: profiles.primary_cluster, wander_picks, galaxy_pool, galaxy_cluster_counts.
-- Mirrors db/contract.md.
begin;

alter table public.profiles add column if not exists primary_cluster text;

-- Must match CLUSTER_IDS in lib/clusters.ts.
alter table public.profiles
  add constraint profiles_primary_cluster_valid
  check (primary_cluster is null or primary_cluster in ('quiet_company', 'armor_up', 'carrying_loss', 'somewhere_else', 'old_selves'));

-- Same song, far apart in feeling. One row per candidate profile (widest gap), no existing card.
create or replace function public.wander_picks(
  target_profile_id uuid,
  match_count int default 6,
  min_emotion_gap float default 0.9
)
returns table (profile_id uuid, display_name text, song_pick_id uuid, target_pick_id uuid, emotion_gap float)
language sql stable
security invoker
set search_path = public, extensions
as $$
  select * from (
    select distinct on (c.profile_id)
           c.profile_id, pr.display_name, c.id as song_pick_id, t.id as target_pick_id,
           sqrt(power(c.valence - t.valence, 2) + power(c.energy - t.energy, 2))::float as emotion_gap
    from public.song_picks t
    join public.song_picks c on c.song_id = t.song_id and c.profile_id <> t.profile_id and c.is_public
    join public.profiles pr on pr.id = c.profile_id
    where t.profile_id = target_profile_id
      and sqrt(power(c.valence - t.valence, 2) + power(c.energy - t.energy, 2)) >= min_emotion_gap
      and not exists (
        select 1 from public.connection_cards cc
        where cc.user_a = least(target_profile_id, c.profile_id)
          and cc.user_b = greatest(target_profile_id, c.profile_id)
      )
    order by c.profile_id, sqrt(power(c.valence - t.valence, 2) + power(c.energy - t.energy, 2)) desc
  ) w
  order by w.emotion_gap desc
  limit match_count;
$$;

-- One row per candidate profile: the pick of theirs closest to any of the target's picks.
-- Same grouping as match_picks, but each of the target's picks does its own HNSW-ordered
-- nearest-neighbor lookup (LATERAL ... ORDER BY <=> LIMIT), so cost is bounded by
-- near_size x (target's pick count), not by the size of song_picks.
create or replace function public.galaxy_pool(
  target_profile_id uuid,
  near_size int default 600,
  fresh_size int default 100,
  fresh_days int default 14
)
returns table (
  profile_id uuid,
  display_name text,
  cluster text,
  similarity float,
  joined_days_ago int,
  tags text[],
  valence float,
  energy float,
  source text            -- 'near' | 'fresh'
)
language sql stable
security invoker
set search_path = public, extensions
as $$
  with near_hits as (
    select h.profile_id, h.tags, h.valence, h.energy, 1 - h.dist as similarity
    from song_picks mine
    cross join lateral (
      select p.profile_id, p.tags, p.valence, p.energy, p.embedding <=> mine.embedding as dist
      from song_picks p
      where p.profile_id <> target_profile_id and p.is_public
      order by p.embedding <=> mine.embedding
      limit near_size
    ) h
    where mine.profile_id = target_profile_id
  ),
  near_best as (
    select distinct on (profile_id) profile_id, tags, valence, energy, similarity
    from near_hits
    order by profile_id, similarity desc
  ),
  near_top as (
    select * from near_best order by similarity desc limit near_size
  ),
  fresh_profiles as (
    select pr.id
    from profiles pr
    where pr.id <> target_profile_id
      and pr.created_at > now() - make_interval(days => fresh_days)
      and pr.id not in (select profile_id from near_top)
    order by pr.created_at desc
    limit fresh_size
  ),
  -- New people may not be near anyone yet; score each against the target's picks directly (small set).
  fresh_best as (
    select distinct on (p.profile_id) p.profile_id, p.tags, p.valence, p.energy,
           1 - (p.embedding <=> mine.embedding) as similarity
    from fresh_profiles f
    join song_picks p on p.profile_id = f.id and p.is_public
    join song_picks mine on mine.profile_id = target_profile_id
    order by p.profile_id, p.embedding <=> mine.embedding
  ),
  pool as (
    select *, 'near'::text as source from near_top
    union all
    select *, 'fresh'::text as source from fresh_best
  )
  select pool.profile_id,
         pr.display_name,
         coalesce(pr.primary_cluster, 'unassigned') as cluster,
         pool.similarity::float,
         greatest(0, extract(day from now() - pr.created_at))::int as joined_days_ago,
         pool.tags,
         pool.valence::float,
         pool.energy::float,
         pool.source
  from pool
  join profiles pr on pr.id = pool.profile_id;
$$;

-- Everyone, per cluster, excluding the target. The route subtracts what it drew to get `hidden`.
create or replace function public.galaxy_cluster_counts(target_profile_id uuid)
returns table (cluster text, people bigint)
language sql stable
security invoker
set search_path = public, extensions
as $$
  select coalesce(primary_cluster, 'unassigned') as cluster, count(*) as people
  from profiles
  where id <> target_profile_id
  group by 1;
$$;

revoke all on function public.wander_picks(uuid, int, float) from public;
grant execute on function public.wander_picks(uuid, int, float) to authenticated, service_role;
revoke all on function public.galaxy_pool(uuid, int, int, int) from public;
grant execute on function public.galaxy_pool(uuid, int, int, int) to authenticated, service_role;
revoke all on function public.galaxy_cluster_counts(uuid) from public;
grant execute on function public.galaxy_cluster_counts(uuid) to authenticated, service_role;

commit;
