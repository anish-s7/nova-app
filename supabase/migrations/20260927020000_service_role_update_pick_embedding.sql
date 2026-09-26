-- Lets the backend recompute pick vectors when the formula changes
-- (scripts/recompute-pick-embeddings.ts; formula in lib/matching/pickEmbedding.ts).
-- Column-scoped: the service role still can't edit tags, valence, energy or ownership.
begin;

grant update (embedding) on table public.song_picks to service_role;

commit;
