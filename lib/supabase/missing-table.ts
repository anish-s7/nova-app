/**
 * True when a PostgREST/Postgres error means the table doesn't exist (PGRST205: not in PostgREST's
 * schema cache; 42P01: undefined table). Used where code is ahead of the hosted schema, so a
 * not-yet-applied migration (e.g. 20260929000000_topic_clusters.sql) degrades to the old behavior
 * instead of failing the request.
 */
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}
