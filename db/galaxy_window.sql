-- Galaxy window: the bounded candidate pool the front page samples from.
-- UNTESTED against a live database (no migration has been applied yet, see CLAUDE.md).
-- Depends on a column that does not exist yet: profiles.primary_cluster text
-- (clusters aren't stored; lib/types.ts mismatch #5). Null is treated as 'unassigned'.
-- Documented in db/contract.md ("Galaxy window").

-- One row per candidate profile: the pick of theirs closest to any of the target's picks.
-- Same grouping as match_picks, but each of the target's picks does its own HNSW-ordered
-- nearest-neighbor lookup (LATERAL ... ORDER BY <=> LIMIT), so cost is bounded by
-- near_size x (target's pick count), not by the size of song_picks.
create or replace function galaxy_pool(
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
create or replace function galaxy_cluster_counts(target_profile_id uuid)
returns table (cluster text, people bigint)
language sql stable
as $$
  select coalesce(primary_cluster, 'unassigned') as cluster, count(*) as people
  from profiles
  where id <> target_profile_id
  group by 1;
$$;
