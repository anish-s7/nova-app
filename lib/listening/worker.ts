import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import { LISTENING_WORKER_BUDGET_MS, LISTENING_WORKER_PAGE_LIMIT } from "./config";
import { SupabaseSyncRepository, toCommitPageEvent, type ClaimedJob, type SyncRepository } from "./repository";
import { ListeningProviderError, type ListeningAdapter, type ListeningProvider } from "./types";
import { recomputeTasteSnapshot } from "../taste/snapshots";

export type WorkerAdapters = Record<ListeningProvider, ListeningAdapter>;
export type ProviderPacer = { wait(provider: ListeningProvider, signal: AbortSignal): Promise<void> };

export type WorkerRunResult =
  | { status: "idle" }
  | { status: "complete" | "released" | "failed"; jobId: string; pages: number; inserted: number; duplicates: number };

export class SupabaseProviderPacer implements ProviderPacer {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly intervals: Record<ListeningProvider, number> = { lastfm: 250, listenbrainz: 100 },
    private readonly now: () => number = Date.now,
  ) {}

  async wait(provider: ListeningProvider, signal: AbortSignal): Promise<void> {
    const { data, error } = await this.client.rpc("reserve_listening_provider_request", {
      p_provider: provider,
      p_min_interval_ms: this.intervals[provider],
    });
    if (error) throw new Error("Unable to reserve listening provider request", { cause: error });
    const delay = Math.max(0, Date.parse(data) - this.now());
    if (delay <= 0) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, delay);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("Provider pacing aborted"));
      }, { once: true });
    });
  }
}

export async function runListeningWorker(input: {
  repository: SyncRepository;
  adapters: WorkerAdapters;
  pacer?: ProviderPacer;
  now?: () => number;
  pageLimit?: number;
  budgetMs?: number;
  onRangeComplete?: (job: ClaimedJob) => Promise<void>;
}): Promise<WorkerRunResult> {
  const now = input.now ?? Date.now;
  const started = now();
  const pageLimit = input.pageLimit ?? LISTENING_WORKER_PAGE_LIMIT;
  const budgetMs = input.budgetMs ?? LISTENING_WORKER_BUDGET_MS;
  const job = await input.repository.claimDueJob(new Date(started).toISOString());
  if (!job) return { status: "idle" };

  let pages = 0;
  let inserted = 0;
  let duplicates = 0;
  let checkpointRevision = job.checkpointRevision;
  let cursor = job.cursor;
  const deadline = started + budgetMs;

  try {
    while (pages < pageLimit && now() < deadline) {
      const remaining = Math.max(1, deadline - now());
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("Listening worker deadline exceeded")), remaining);
      try {
        await input.pacer?.wait(job.provider, controller.signal);
        const page = await input.adapters[job.provider].fetchPage({
          username: job.username,
          lowerInclusiveSec: isoSeconds(job.rangeLowerIso),
          upperExclusiveSec: isoSeconds(job.rangeUpperIso),
          cursor,
          signal: controller.signal,
        });
        const commit = await input.repository.commitPage({
          jobId: job.id,
          leaseToken: job.leaseToken,
          connectionGeneration: job.connectionGeneration,
          expectedCheckpointRevision: checkpointRevision,
          events: page.events.map((listen) => toCommitPageEvent({
            provider: job.provider,
            connectionGeneration: job.connectionGeneration,
            listen,
            alias: aliasFor(job.provider, listen),
            sourceMetadata: { provider: job.provider },
          })),
          nextCursor: page.nextCursor,
          rangeComplete: page.rangeComplete,
        });
        pages += 1;
        checkpointRevision += 1;
        inserted += commit.inserted;
        duplicates += commit.duplicates;
        cursor = page.nextCursor;
        if (page.rangeComplete) {
          await input.onRangeComplete?.(job);
          return { status: "complete", jobId: job.id, pages, inserted, duplicates };
        }
      } finally {
        clearTimeout(timer);
      }
    }
    await input.repository.releaseJob({
      jobId: job.id,
      leaseToken: job.leaseToken,
      connectionGeneration: job.connectionGeneration,
      expectedCheckpointRevision: checkpointRevision,
      nextAttemptAtIso: new Date(now()).toISOString(),
    });
    return { status: "released", jobId: job.id, pages, inserted, duplicates };
  } catch (error) {
    const providerError = normalizeError(error);
    const retryAt = now() + (providerError.retryAfterMs ?? (providerError.retryable ? 30_000 : 0));
    try {
      await input.repository.failJob({
        jobId: job.id,
        leaseToken: job.leaseToken,
        connectionGeneration: job.connectionGeneration,
        expectedCheckpointRevision: checkpointRevision,
        retryable: providerError.retryable,
        nextAttemptAtIso: new Date(retryAt).toISOString(),
        safeErrorCode: providerError.code,
      });
    } catch {
      // A disconnect/reconfigure intentionally fences the lease while HTTP is in flight.
    }
    return { status: "failed", jobId: job.id, pages, inserted, duplicates };
  }
}

export function createSupabaseWorker(input: { client: SupabaseClient<Database>; adapters: WorkerAdapters }) {
  return () => runListeningWorker({
    repository: new SupabaseSyncRepository(input.client),
    adapters: input.adapters,
    pacer: new SupabaseProviderPacer(input.client),
    onRangeComplete: async (job) => {
      try {
        await recomputeTasteSnapshot({ client: input.client, profileId: job.profileId, connectionId: job.connectionId });
      } catch (error) {
        // Ingestion is already durably complete. A later sync or preference change
        // retries derivation without relabeling the provider job as failed.
        console.error("Taste snapshot recomputation failed", error);
      }
    },
  });
}

function aliasFor(provider: ListeningProvider, listen: Parameters<typeof toCommitPageEvent>[0]["listen"]) {
  if (provider === "listenbrainz" && listen.recording.providerTrackId) {
    return { namespace: "listenbrainz_msid" as const, identifier: listen.recording.providerTrackId, resolutionMethod: "provider_id" as const, provenance: "listenbrainz" };
  }
  if (listen.recording.recordingMbid) {
    return { namespace: "musicbrainz_recording" as const, identifier: listen.recording.recordingMbid, resolutionMethod: "provider_id" as const, provenance: provider };
  }
  return undefined;
}

function isoSeconds(value: string): number {
  const milliseconds = Date.parse(value);
  if (Number.isNaN(milliseconds)) throw new Error("Worker received an invalid job range");
  return Math.floor(milliseconds / 1000);
}

function normalizeError(error: unknown): ListeningProviderError {
  if (error instanceof ListeningProviderError) return error;
  return new ListeningProviderError({
    code: "provider_unavailable",
    message: "Listening sync failed",
    retryable: true,
    cause: error,
  });
}

export type { ClaimedJob };
