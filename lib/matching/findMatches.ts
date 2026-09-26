import { createServerClient } from "../supabase/server";

export interface MatchResult {
  profileId: string;
  displayName: string;
  similarity: number;
}

/**
 * Finds profiles whose motivation embeddings are closest to the given
 * profile's, via a Postgres RPC (pgvector cosine distance under the hood).
 *
 * Requires a `match_profiles` SQL function in Supabase — see db/contract.md.
 * Ask @db-teammate to add it alongside the schema:
 *
 *   create or replace function match_profiles(
 *     target_profile_id uuid,
 *     match_count int default 10
 *   ) returns table (profile_id uuid, display_name text, similarity float)
 *   ...
 */
export async function findMatches(
  profileId: string,
  limit = 10
): Promise<MatchResult[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("match_profiles", {
    target_profile_id: profileId,
    match_count: limit,
  });

  if (error) {
    throw new Error(`findMatches failed: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    profileId: row.profile_id,
    displayName: row.display_name,
    similarity: row.similarity,
  }));
}
