import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { buildArtistInterests } from "./interests";
import { scoreTaste } from "./score";
import { TASTE_ALGORITHM_VERSION, type DailyTrackInput } from "./types";

export async function recomputeTasteSnapshot(input: {
  client: SupabaseClient<Database>;
  profileId: string;
  connectionId?: string;
  now?: Date;
}): Promise<string | null> {
  const now = input.now ?? new Date();
  const { data: preferences, error: preferenceError } = await input.client
    .from("listening_preferences")
    .select("primary_connection_id, input_revision, timezone")
    .eq("profile_id", input.profileId)
    .maybeSingle();
  if (preferenceError) throw new Error("Unable to load taste preferences", { cause: preferenceError });
  if (!preferences?.primary_connection_id) return null;
  if (input.connectionId && preferences.primary_connection_id !== input.connectionId) return null;

  const { data: connection, error: connectionError } = await input.client
    .from("listening_connections")
    .select("id, generation, status")
    .eq("id", preferences.primary_connection_id)
    .eq("profile_id", input.profileId)
    .maybeSingle();
  if (connectionError || !connection || connection.status !== "active") {
    throw new Error("Unable to load the active taste source", { cause: connectionError ?? undefined });
  }

  const { data: daily, error: aggregateError } = await input.client.rpc("rebuild_listening_daily_tracks", {
    p_profile_id: input.profileId,
    p_connection_id: connection.id,
    p_connection_generation: connection.generation,
    p_expected_input_revision: preferences.input_revision,
    p_as_of: now.toISOString(),
  });
  if (aggregateError) throw new Error("Unable to rebuild listening aggregates", { cause: aggregateError });
  const rows: DailyTrackInput[] = (daily ?? []).map((row) => ({
    trackId: row.track_id,
    title: row.title,
    artistCredit: row.artist_credit,
    artistKey: row.artist_key,
    localDate: row.local_date,
    playCount: row.play_count,
    distinctObservedTimestamps: row.distinct_observed_timestamps,
  }));
  const score = scoreTaste(rows, localDate(now, preferences.timezone));
  const interests = buildArtistInterests(rows, score);
  const { data: snapshotId, error: publishError } = await input.client.rpc("publish_taste_snapshot", {
    p_profile_id: input.profileId,
    p_connection_id: connection.id,
    p_connection_generation: connection.generation,
    p_expected_input_revision: preferences.input_revision,
    p_algorithm_version: TASTE_ALGORITHM_VERSION,
    p_computed_as_of: now.toISOString(),
    p_coverage_start: score.coverageStart,
    p_coverage_end: score.coverageEnd,
    p_coverage_state: score.coverageState,
    p_total_plays: score.totalPlays,
    p_distinct_tracks: score.distinctTracks,
    p_distinct_artists: score.distinctArtists,
    p_observed_days: score.observedDays,
    p_recent_7_plays: score.recent7Plays,
    p_previous_7_plays: score.previous7Plays,
    p_interests: interests,
  });
  if (publishError) throw new Error("Unable to publish taste snapshot", { cause: publishError });
  return snapshotId;
}

export function localDate(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  if (!year || !month || !day) throw new Error("Unable to calculate local date");
  return `${year}-${month}-${day}`;
}
