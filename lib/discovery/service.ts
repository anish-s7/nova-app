import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { combineCandidatePaths, type InterestWeights } from "./candidates";
import { diversifyCandidates } from "./diversify";
import { evidenceText, parseDiscoveryEvidence, publicEvidencePickIds } from "./evidence";
import { rankCandidates, withRanks } from "./rank";
import {
  DISCOVERY_ALGORITHM_VERSION,
  type DiscoveryMode,
  type DiscoverySongDto,
  type RawCandidatePath,
  type RankedDiscoveryCandidate,
} from "./types";

export type DiscoveryResponse = {
  status: "ready" | "not_ready";
  batchId: string | null;
  snapshotId: string | null;
  feedbackRevision: number;
  mode: DiscoveryMode;
  expiresAt: string | null;
  songs: DiscoverySongDto[];
};

export async function getOrCreateDiscovery(input: {
  client: SupabaseClient<Database>;
  profileId: string;
  mode: DiscoveryMode;
  anchorSongId?: string;
  now?: Date;
}): Promise<DiscoveryResponse> {
  const now = input.now ?? new Date();
  const { data: preferences, error: prefError } = await input.client.from("listening_preferences")
    .select("active_taste_snapshot_id, discovery_feedback_revision")
    .eq("profile_id", input.profileId).maybeSingle();
  if (prefError) throw new Error("Unable to load discovery preferences", { cause: prefError });
  if (!preferences?.active_taste_snapshot_id) {
    return { status: "not_ready", batchId: null, snapshotId: null, feedbackRevision: preferences?.discovery_feedback_revision ?? 1, mode: input.mode, expiresAt: null, songs: [] };
  }
  const existingQuery = input.client.from("discovery_batches").select("id, expires_at")
    .eq("profile_id", input.profileId)
    .eq("taste_snapshot_id", preferences.active_taste_snapshot_id)
    .eq("feedback_revision", preferences.discovery_feedback_revision)
    .eq("exploration_mode", input.mode)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false }).limit(1);
  const { data: existing } = input.anchorSongId
    ? await existingQuery.eq("anchor_song_id", input.anchorSongId).maybeSingle()
    : await existingQuery.is("anchor_song_id", null).maybeSingle();
  if (existing) return loadBatch(input.client, input.profileId, existing.id, preferences.active_taste_snapshot_id, preferences.discovery_feedback_revision, input.mode, existing.expires_at);

  const [{ data: interestRows, error: interestError }, { data: rawRows, error: candidateError }] = await Promise.all([
    input.client.from("taste_interests").select("stable_interest_key, recent_weight, core_weight").eq("snapshot_id", preferences.active_taste_snapshot_id).eq("profile_id", input.profileId),
    input.client.rpc("discovery_catalog_candidates", {
      p_profile_id: input.profileId,
      p_taste_snapshot_id: preferences.active_taste_snapshot_id,
      p_anchor_song_id: input.anchorSongId ?? null,
      p_limit: 300,
    }),
  ]);
  if (interestError || candidateError) throw new Error("Unable to retrieve discovery candidates", { cause: interestError ?? candidateError });
  const interests: InterestWeights = new Map((interestRows ?? []).map((row) => [row.stable_interest_key, { recent: row.recent_weight, core: row.core_weight }]));
  const raw: RawCandidatePath[] = (rawRows ?? []).map((row) => ({
    songId: row.song_id, title: row.title, artist: row.artist,
    albumArtUrl: row.album_art_url, spotifyTrackId: row.spotify_track_id,
    pathType: row.path_type as RawCandidatePath["pathType"], interestKey: row.interest_key,
    interestWeight: row.interest_weight, anchorSongId: row.anchor_song_id,
    publicPickId: row.public_pick_id, contributorProfileId: row.contributor_profile_id,
    repeatDays: row.repeat_days, anchorStrength: row.anchor_strength,
    listeningTrackId: row.listening_track_id,
  }));
  const history = await feedbackHistory(input.client, input.profileId);
  const ranked = withRanks(diversifyCandidates(rankCandidates({
    candidates: combineCandidatePaths(raw, interests), mode: input.mode,
    exposureCounts: history.exposureCounts, dismissedSongIds: history.dismissedSongIds,
    savedSongIds: history.savedSongIds,
  })));
  const expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  const { data: batchId, error: publishError } = await input.client.rpc("publish_discovery_batch", {
    p_profile_id: input.profileId,
    p_taste_snapshot_id: preferences.active_taste_snapshot_id,
    p_anchor_song_id: input.anchorSongId ?? null,
    p_feedback_revision: preferences.discovery_feedback_revision,
    p_exploration_mode: input.mode,
    p_algorithm_version: DISCOVERY_ALGORITHM_VERSION,
    p_expires_at: expiresAt,
    p_candidates: ranked.map(persistedCandidate),
  });
  if (publishError) throw new Error("Unable to publish discovery batch", { cause: publishError });
  return loadBatch(input.client, input.profileId, batchId, preferences.active_taste_snapshot_id, preferences.discovery_feedback_revision, input.mode, expiresAt);
}

async function loadBatch(
  client: SupabaseClient<Database>, profileId: string, batchId: string,
  snapshotId: string, feedbackRevision: number, mode: DiscoveryMode, expiresAt: string,
): Promise<DiscoveryResponse> {
  const { data: candidates, error } = await client.from("discovery_candidates")
    .select("id, song_id, rank, pool_type, interest_key, evidence, source_attribution")
    .eq("profile_id", profileId).eq("batch_id", batchId).order("rank");
  if (error) throw new Error("Unable to load discovery batch", { cause: error });
  const songIds = (candidates ?? []).map((candidate) => candidate.song_id);
  const [{ data: songs }, { data: saves }] = await Promise.all([
    songIds.length ? client.from("songs").select("id, title, artist, album_art_url, spotify_track_id").in("id", songIds) : Promise.resolve({ data: [] }),
    songIds.length ? client.from("discovery_saves").select("song_id").eq("profile_id", profileId).in("song_id", songIds) : Promise.resolve({ data: [] }),
  ]);
  const songOf = new Map((songs ?? []).map((song) => [song.id, song]));
  const savedIds = new Set((saves ?? []).map((save) => save.song_id));
  const evidenceRows = (candidates ?? []).flatMap((candidate) => {
    const evidence = parseDiscoveryEvidence(candidate.evidence);
    return evidence ? [{ candidate, evidence }] : [];
  });
  const requiredPickIds = [...new Set(evidenceRows.flatMap(({ evidence }) => publicEvidencePickIds(evidence)))];
  const { data: visiblePicks } = requiredPickIds.length
    ? await client.from("song_picks").select("id").in("id", requiredPickIds).eq("is_public", true)
    : { data: [] };
  const visible = new Set((visiblePicks ?? []).map((pick) => pick.id));
  const anchorIds = [...new Set(evidenceRows.flatMap(({ evidence }) => "anchorSongId" in evidence ? [evidence.anchorSongId] : []))];
  const { data: anchors } = anchorIds.length ? await client.from("songs").select("id, title").in("id", anchorIds) : { data: [] };
  const anchorTitles = new Map((anchors ?? []).map((song) => [song.id, song.title]));
  const result: DiscoverySongDto[] = [];
  for (const { candidate, evidence } of evidenceRows) {
    const song = songOf.get(candidate.song_id);
    if (!song) continue;
    const pickIds = publicEvidencePickIds(evidence);
    if (pickIds.some((id) => !visible.has(id))) continue;
    result.push({
      candidateId: candidate.id, rank: candidate.rank,
      pool: candidate.pool_type as DiscoverySongDto["pool"], interestKey: candidate.interest_key,
      song: { id: song.id, title: song.title, artist: song.artist, albumArtUrl: song.album_art_url, spotifyId: song.spotify_track_id },
      reason: evidenceText(evidence, { songTitle: song.title, anchorTitles }),
      evidence, sourceAttribution: candidate.source_attribution, saved: savedIds.has(song.id),
    });
  }
  return { status: "ready", batchId, snapshotId, feedbackRevision, mode, expiresAt, songs: result };
}

async function feedbackHistory(client: SupabaseClient<Database>, profileId: string) {
  const [{ data: priorCandidates }, { data: events }, { data: saves }] = await Promise.all([
    client.from("discovery_candidates").select("id, song_id").eq("profile_id", profileId),
    client.from("discovery_events").select("candidate_id, action, created_at").eq("profile_id", profileId),
    client.from("discovery_saves").select("song_id").eq("profile_id", profileId),
  ]);
  const songForCandidate = new Map((priorCandidates ?? []).map((candidate) => [candidate.id, candidate.song_id]));
  const exposureCounts = new Map<string, number>();
  const dismissedSongIds = new Set<string>();
  const notNowCutoff = Date.now() - 7 * 86_400_000;
  for (const event of events ?? []) {
    const songId = songForCandidate.get(event.candidate_id);
    if (!songId) continue;
    if (event.action === "impression") exposureCounts.set(songId, (exposureCounts.get(songId) ?? 0) + 1);
    if (event.action === "dismiss" || event.action === "hide_artist" || (event.action === "not_now" && Date.parse(event.created_at) >= notNowCutoff)) dismissedSongIds.add(songId);
  }
  return { exposureCounts, dismissedSongIds, savedSongIds: new Set((saves ?? []).map((save) => save.song_id)) };
}

function persistedCandidate(candidate: RankedDiscoveryCandidate) {
  return {
    songId: candidate.songId, rank: candidate.rank, poolType: candidate.poolType,
    interestKey: candidate.interestKey, componentScores: candidate.componentScores,
    evidence: candidate.evidence, sourceAttribution: candidate.sourceAttribution,
  };
}
