import assert from "node:assert/strict";
import test from "node:test";
import { runListeningWorker } from "../../lib/listening/worker";
import { ListeningProviderError, type ListeningAdapter } from "../../lib/listening/types";
import type { ClaimedJob, CommitPageInput, FailJobInput, ReleaseJobInput, SyncRepository } from "../../lib/listening/repository";

const job: ClaimedJob = {
  id: "job", profileId: "profile", connectionId: "connection", connectionGeneration: 3,
  provider: "lastfm", username: "user", kind: "backfill",
  rangeLowerIso: "2026-01-01T00:00:00.000Z", rangeUpperIso: "2026-02-01T00:00:00.000Z",
  cursor: null, checkpointRevision: 4, leaseToken: "lease", leaseExpiresAtIso: "2026-02-01T00:02:00.000Z",
};

test("worker commits pages then releases an interrupted job at the advanced checkpoint", async () => {
  const commits: CommitPageInput[] = [];
  let release: ReleaseJobInput | undefined;
  const repository = repositoryStub({
    commitPage: async (input) => { commits.push(input); return { inserted: 1, duplicates: 0, inputRevision: 1 }; },
    releaseJob: async (input) => { release = input; },
  });
  let page = 0;
  const adapter = adapterStub(async () => ({
    events: [{ recording: { title: `Track ${page}`, artistCredit: "Artist" }, playedAtSec: 1768000000 + page++ }],
    nextCursor: { provider: "lastfm", page: page + 1 }, rangeComplete: false,
  }));
  const result = await runListeningWorker({ repository, adapters: { lastfm: adapter, listenbrainz: adapter }, pageLimit: 2, budgetMs: 10_000, now: () => 1_770_000_000_000 });
  assert.equal(result.status, "released");
  assert.equal(commits.length, 2);
  assert.equal(commits[1].expectedCheckpointRevision, 5);
  assert.equal(release?.expectedCheckpointRevision, 6);
});

test("worker maps retryable errors to a safe retry without committing", async () => {
  let failure: FailJobInput | undefined;
  const repository = repositoryStub({ failJob: async (input) => { failure = input; } });
  const adapter = adapterStub(async () => { throw new ListeningProviderError({ code: "rate_limited", message: "secret", retryable: true, retryAfterMs: 60_000 }); });
  const result = await runListeningWorker({ repository, adapters: { lastfm: adapter, listenbrainz: adapter }, now: () => 1_770_000_000_000 });
  assert.equal(result.status, "failed");
  assert.equal(failure?.safeErrorCode, "rate_limited");
  assert.equal(failure?.retryable, true);
  assert.equal(failure?.expectedCheckpointRevision, 4);
});

test("generation fencing during an active fetch is treated as an intentional stale job", async () => {
  let failed = false;
  const repository = repositoryStub({
    commitPage: async () => { throw Object.assign(new Error("stale"), { code: "40001" }); },
    failJob: async () => { failed = true; throw new Error("also stale"); },
  });
  const adapter = adapterStub(async () => ({ events: [], nextCursor: null, rangeComplete: true }));
  const result = await runListeningWorker({ repository, adapters: { lastfm: adapter, listenbrainz: adapter }, now: () => 1_770_000_000_000 });
  assert.equal(result.status, "failed");
  assert.equal(failed, true);
});

test("taste derivation is requested only after a range commits complete", async () => {
  const completed: ClaimedJob[] = [];
  const repository = repositoryStub({});
  const adapter = adapterStub(async () => ({ events: [], nextCursor: null, rangeComplete: true }));
  const result = await runListeningWorker({
    repository,
    adapters: { lastfm: adapter, listenbrainz: adapter },
    now: () => 1_770_000_000_000,
    onRangeComplete: async (claimed) => { completed.push(claimed); },
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(completed.map((item) => item.id), ["job"]);
});

function adapterStub(fetchPage: ListeningAdapter["fetchPage"]): ListeningAdapter {
  return { provider: "lastfm", validateUsername: async (value) => value, fetchPage };
}

function repositoryStub(overrides: Partial<SyncRepository>): SyncRepository {
  return {
    claimDueJob: async () => job,
    commitPage: async () => ({ inserted: 0, duplicates: 0, inputRevision: 1 }),
    releaseJob: async () => {}, failJob: async () => {}, ...overrides,
  };
}
