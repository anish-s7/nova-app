-- Scene gateway/population queries (docs/plans/galaxy-communities.md, Direction B, step 5).
-- Deliberately reuses galaxy_pool as a CTE rather than re-deriving pgvector proximity: per the plan's
-- gateway-detection fix, a scene's gateway MUST stay scoped to the viewer's own galaxy_pool (the same
-- ~700-candidate pool hop's assertHopAllowed already trusts), never "everyone in the scene app-wide" —
-- otherwise a chosen gateway could 403 the moment someone tries to hop to them.
begin;

-- Ranked gateway candidates into one scene, scoped to the viewer's own pool and to public picks only
-- (song_picks.is_public — a private pick must never surface someone as a gateway). One row per eligible
-- profile: their strongest (highest-weight) public pick in this scene, and the pool similarity that
-- already ranks them for the viewer.
create or replace function public.scene_pool(target_profile_id uuid, target_scene_id uuid)
returns table (
  profile_id uuid,
  display_name text,
  similarity float,
  song_pick_id uuid,
  song_id uuid,
  song_title text,
  song_artist text,
  membership_weight float
)
language sql stable
security invoker
set search_path = public, extensions
as $$
  select distinct on (gp.profile_id)
         gp.profile_id, gp.display_name, gp.similarity,
         sp.id as song_pick_id, s.id as song_id, s.title as song_title, s.artist as song_artist,
         ssm.weight as membership_weight
  from public.galaxy_pool(target_profile_id) gp
  join public.song_picks sp on sp.profile_id = gp.profile_id and sp.is_public
  join public.song_scene_memberships ssm on ssm.song_id = sp.song_id and ssm.scene_id = target_scene_id
  join public.songs s on s.id = sp.song_id
  order by gp.profile_id, ssm.weight desc, gp.similarity desc;
$$;

-- True population per published scene, excluding the viewer — mirrors galaxy_cluster_counts.
create or replace function public.scene_counts(target_profile_id uuid)
returns table (scene_id uuid, people bigint)
language sql stable
security invoker
set search_path = public, extensions
as $$
  select ssm.scene_id, count(distinct sp.profile_id) as people
  from public.song_scene_memberships ssm
  join public.song_picks sp on sp.song_id = ssm.song_id and sp.is_public
  where sp.profile_id <> target_profile_id
  group by ssm.scene_id;
$$;

revoke all on function public.scene_pool(uuid, uuid) from public;
revoke all on function public.scene_counts(uuid) from public;
grant execute on function public.scene_pool(uuid, uuid) to authenticated, service_role;
grant execute on function public.scene_counts(uuid) to authenticated, service_role;

commit;
