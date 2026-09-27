import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import {
  listenIdempotencyFingerprint,
  normalizeArtistKey,
  recordingIdentityFingerprint,
} from "./identity";
import {
  assertCursorForProvider,
  type ListeningProvider,
  type ObservedListen,
  type SyncCursor,
} from "./types";

export type ListeningSyncKind = "backfill" | "incremental" | "reconcile";

export type ClaimedJob = {
  id: string;
  profileId: string;
  connectionId: string;
  connectionGeneration: number;
  provider: ListeningProvider;
  username: string;
  kind: ListeningSyncKind;
  rangeLowerIso: string;
  rangeUpperIso: string;
  cursor: SyncCursor | null;
  checkpointRevision: number;
  leaseToken: string;
  leaseExpiresAtIso: string;
};

export type CommitPageEvent = {
  playedAtIso: string;
  idempotencyFingerprint: string;
  providerEventId?: string;
  recording: {
    title: string;
    artistCredit: string;
    artistKey: string;
    album?: string;
    versionHint?: string;
    identityFingerprint: string;
    catalogSongId?: string;
    identityStatus?: "unresolved" | "catalog_matched" | "ambiguous";
  };
  alias?: {
    namespace:
      | "lastfm_fingerprint"
      | "musicbrainz_recording"
      | "listenbrainz_msid"
      | "listenbrainz_fingerprint";
    identifier: string;
    resolutionMethod: "provider_id" | "conservative_text" | "catalog_link";
    provenance: string;
  };
  sourceMetadata?: Record<string, string | number | boolean | null>;
};

type LeaseMutation = {
  jobId: string;
  leaseToken: string;
  connectionGeneration: number;
  expectedCheckpointRevision: number;
};

export type CommitPageInput = LeaseMutation & {
  events: CommitPageEvent[];
  nextCursor: SyncCursor | null;
  rangeComplete: boolean;
};

export type ReleaseJobInput = LeaseMutation & {
  nextAttemptAtIso: string;
};

export type FailJobInput = LeaseMutation & {
  retryable: boolean;
  nextAttemptAtIso: string;
  safeErrorCode: string;
};

export interface SyncRepository {
  claimDueJob(nowIso: string): Promise<ClaimedJob | null>;
  commitPage(input: CommitPageInput): Promise<{
    inserted: number;
    duplicates: number;
    inputRevision: number;
  }>;
  releaseJob(input: ReleaseJobInput): Promise<void>;
  failJob(input: FailJobInput): Promise<void>;
}

export function toCommitPageEvent(input: {
  provider: ListeningProvider;
  connectionGeneration: number;
  listen: ObservedListen;
  alias?: CommitPageEvent["alias"];
  sourceMetadata?: CommitPageEvent["sourceMetadata"];
}): CommitPageEvent {
  const playedAt = new Date(input.listen.playedAtSec * 1000);
  if (!Number.isSafeInteger(input.listen.playedAtSec) || Number.isNaN(playedAt.valueOf())) {
    throw new Error("Invalid listen timestamp");
  }
  return {
    playedAtIso: playedAt.toISOString(),
    idempotencyFingerprint: listenIdempotencyFingerprint(input),
    providerEventId: input.listen.providerEventId,
    recording: {
      title: input.listen.recording.title,
      artistCredit: input.listen.recording.artistCredit,
      artistKey: normalizeArtistKey(input.listen.recording.artistCredit),
      album: input.listen.recording.album,
      versionHint: input.listen.recording.versionHint,
      identityFingerprint: recordingIdentityFingerprint(input.listen.recording),
    },
    alias: input.alias,
    sourceMetadata: input.sourceMetadata,
  };
}

function validIso(value: string, field: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`Invalid ${field}`);
}

function repositoryError(action: string, error: { message: string; code?: string }): Error {
  const wrapped = new Error(`Listening repository ${action} failed`);
  Object.assign(wrapped, { code: error.code, cause: error });
  return wrapped;
}

export class SupabaseSyncRepository implements SyncRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async claimDueJob(nowIso: string): Promise<ClaimedJob | null> {
    validIso(nowIso, "claim time");
    const { data, error } = await this.client.rpc("claim_listening_job", { p_now: nowIso });
    if (error) throw repositoryError("claim", error);
    const row = data?.[0];
    if (!row) return null;

    const cursor = row.continuation as SyncCursor | null;
    assertCursorForProvider(row.provider, cursor);
    if (!row.lease_token) throw new Error("Claimed job did not include a lease token");

    return {
      id: row.id,
      profileId: row.profile_id,
      connectionId: row.connection_id,
      connectionGeneration: row.connection_generation,
      provider: row.provider,
      username: row.canonical_username,
      kind: row.kind,
      rangeLowerIso: row.range_lower,
      rangeUpperIso: row.range_upper,
      cursor,
      checkpointRevision: row.checkpoint_revision,
      leaseToken: row.lease_token,
      leaseExpiresAtIso: row.lease_expires_at,
    };
  }

  async commitPage(input: CommitPageInput): Promise<{
    inserted: number;
    duplicates: number;
    inputRevision: number;
  }> {
    if (input.events.length > 1000) throw new Error("A page cannot exceed 1000 events");
    if (input.rangeComplete && input.nextCursor !== null) {
      throw new Error("A complete range cannot include a continuation cursor");
    }
    const { data, error } = await this.client.rpc("commit_listening_page", {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_connection_generation: input.connectionGeneration,
      p_expected_checkpoint_revision: input.expectedCheckpointRevision,
      p_events: input.events,
      p_next_continuation: input.nextCursor,
      p_range_complete: input.rangeComplete,
    });
    if (error) throw repositoryError("commit", error);
    const result = data?.[0];
    if (!result) throw new Error("Listening page commit returned no result");
    return {
      inserted: result.inserted,
      duplicates: result.duplicates,
      inputRevision: result.input_revision,
    };
  }

  async releaseJob(input: ReleaseJobInput): Promise<void> {
    validIso(input.nextAttemptAtIso, "next attempt time");
    const { error } = await this.client.rpc("release_listening_job", {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_connection_generation: input.connectionGeneration,
      p_expected_checkpoint_revision: input.expectedCheckpointRevision,
      p_next_attempt_at: input.nextAttemptAtIso,
    });
    if (error) throw repositoryError("release", error);
  }

  async failJob(input: FailJobInput): Promise<void> {
    validIso(input.nextAttemptAtIso, "retry time");
    if (!input.safeErrorCode || input.safeErrorCode.length > 80) {
      throw new Error("Invalid safe error code");
    }
    const { error } = await this.client.rpc("fail_listening_job", {
      p_job_id: input.jobId,
      p_lease_token: input.leaseToken,
      p_connection_generation: input.connectionGeneration,
      p_expected_checkpoint_revision: input.expectedCheckpointRevision,
      p_retryable: input.retryable,
      p_next_attempt_at: input.nextAttemptAtIso,
      p_safe_error_code: input.safeErrorCode,
    });
    if (error) throw repositoryError("fail", error);
  }
}

