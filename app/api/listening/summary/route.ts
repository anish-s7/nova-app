import { listeningEnabled } from "@/lib/listening/config";
import { privateJson } from "@/lib/listening/routes";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  const profileId = await getCurrentProfileId();
  if (!profileId) return privateJson({ error: "Not authenticated" }, { status: 401 });
  if (!listeningEnabled()) return privateJson({ error: "Listening imports are not enabled" }, { status: 404 });
  const supabase = createServerClient();
  const { data: preferences, error: preferenceError } = await supabase
    .from("listening_preferences")
    .select("primary_connection_id, active_taste_snapshot_id, input_revision, timezone")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (preferenceError) return privateJson({ error: "Unable to load listening summary" }, { status: 500 });
  if (!preferences?.primary_connection_id) return privateJson({ status: "no_source", snapshot: null, interests: [] });

  const { data: connection } = await supabase.from("listening_connections")
    .select("id, provider, canonical_username, generation, status, last_successful_query_at, latest_observed_listen_at, safe_error_code")
    .eq("id", preferences.primary_connection_id).eq("profile_id", profileId).maybeSingle();
  if (!connection) return privateJson({ status: "no_source", snapshot: null, interests: [] });
  const { data: job } = await supabase.from("listening_sync_jobs")
    .select("id, state, events_seen, events_inserted, safe_error_code, updated_at")
    .eq("connection_id", connection.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!preferences.active_taste_snapshot_id) {
    return privateJson({
      status: job && ["queued", "running", "retry_wait"].includes(job.state) ? "syncing" : "pending",
      primarySource: sourceDto(connection), sync: syncDto(connection, job), snapshot: null, interests: [],
    });
  }

  const [{ data: snapshot, error: snapshotError }, { data: interests, error: interestError }] = await Promise.all([
    supabase.from("taste_snapshots").select("*").eq("id", preferences.active_taste_snapshot_id).eq("profile_id", profileId).maybeSingle(),
    supabase.from("taste_interests").select("stable_interest_key, label, seed_artists, recent_weight, core_weight, confidence, evidence_days, representative_tracks").eq("snapshot_id", preferences.active_taste_snapshot_id).eq("profile_id", profileId).order("core_weight", { ascending: false }),
  ]);
  if (snapshotError || interestError || !snapshot) return privateJson({ error: "Unable to load listening summary" }, { status: 500 });
  const stale = snapshot.input_revision !== preferences.input_revision || snapshot.primary_source_generation !== connection.generation;
  const interestDtos = (interests ?? []).map((interest) => ({
    key: interest.stable_interest_key,
    label: interest.label,
    recentWeight: interest.recent_weight,
    coreWeight: interest.core_weight,
    confidence: interest.confidence,
    evidenceDays: interest.evidence_days,
    direction: direction(interest.recent_weight, interest.core_weight),
    representativeTracks: interest.representative_tracks,
  }));
  const recentTracks = interestDtos.flatMap((interest) =>
    Array.isArray(interest.representativeTracks)
      ? (interest.representativeTracks as { trackId: string; title: string; artistCredit: string; recentWeight: number }[])
        .map((track) => ({ ...track, interestKey: interest.key }))
      : [],
  ).sort((a, b) => b.recentWeight - a.recentWeight).filter((track, index, all) => all.findIndex((item) => item.trackId === track.trackId) === index).slice(0, 5);
  return privateJson({
    status: snapshot.coverage_state === "empty" ? "empty" : stale ? "refreshing" : "ready",
    primarySource: sourceDto(connection),
    sync: syncDto(connection, job),
    snapshot: {
      id: snapshot.id,
      asOf: snapshot.computed_as_of,
      timezone: snapshot.timezone,
      coverageStart: snapshot.coverage_start,
      coverageEnd: snapshot.coverage_end,
      coverageState: snapshot.coverage_state,
      totalPlays: snapshot.total_plays,
      distinctTracks: snapshot.distinct_tracks,
      distinctArtists: snapshot.distinct_artists,
      observedDays: snapshot.observed_days,
      recent7Plays: snapshot.recent_7_plays,
      previous7Plays: snapshot.previous_7_plays,
      weeklyDirection: weeklyDirection(snapshot.recent_7_plays, snapshot.previous_7_plays),
      stale,
    },
    interests: interestDtos,
    recentTracks,
  });
}

function sourceDto(connection: { provider: string; canonical_username: string }) {
  return { provider: connection.provider, username: connection.canonical_username, verified: false };
}

function syncDto(connection: { last_successful_query_at: string | null; latest_observed_listen_at: string | null; safe_error_code: string | null }, job: { id: string; state: string; events_seen: number; events_inserted: number; safe_error_code: string | null; updated_at: string } | null) {
  return {
    lastSuccessfulQueryAt: connection.last_successful_query_at,
    latestObservedListenAt: connection.latest_observed_listen_at,
    errorCode: job?.safe_error_code ?? connection.safe_error_code,
    job: job ? { id: job.id, state: job.state, eventsSeen: job.events_seen, eventsInserted: job.events_inserted, updatedAt: job.updated_at } : null,
  };
}

function direction(recent: number, core: number): "rising" | "steady" | "cooling" {
  if (recent > core * 1.2) return "rising";
  if (recent < core * 0.8) return "cooling";
  return "steady";
}

function weeklyDirection(recent: number, previous: number): "new" | "up" | "steady" | "down" | "quiet" {
  if (recent === 0 && previous === 0) return "quiet";
  if (previous === 0) return "new";
  const ratio = recent / previous;
  return ratio > 1.2 ? "up" : ratio < 0.8 ? "down" : "steady";
}
