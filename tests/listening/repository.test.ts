import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseSyncRepository, toCommitPageEvent } from "../../lib/listening/repository";
import type { Database } from "../../lib/supabase/types";

type RpcResult = { data: unknown; error: null | { message: string; code?: string } };

function mockClient(handler: (name: string, args: unknown) => RpcResult): SupabaseClient<Database> {
  return { rpc: async (name: string, args: unknown) => handler(name, args) } as unknown as SupabaseClient<Database>;
}

test("claim maps the worker-only row and validates cursor/provider consistency", async () => {
  const repository = new SupabaseSyncRepository(
    mockClient(() => ({
      data: [
        {
          id: "job",
          profile_id: "profile",
          connection_id: "connection",
          connection_generation: 2,
          provider: "lastfm",
          canonical_username: "fixture-user",
          kind: "backfill",
          range_lower: "2026-08-01T00:00:00.000Z",
          range_upper: "2026-09-01T00:00:00.000Z",
          continuation: { provider: "lastfm", page: 2 },
          checkpoint_revision: 3,
          lease_token: "lease",
          lease_expires_at: "2026-09-01T00:02:00.000Z",
        },
      ],
      error: null,
    })),
  );
  const claim = await repository.claimDueJob("2026-09-01T00:00:00.000Z");
  assert.equal(claim?.provider, "lastfm");
  assert.deepEqual(claim?.cursor, { provider: "lastfm", page: 2 });
  assert.equal(claim?.checkpointRevision, 3);
});

test("commit carries generation, lease and checkpoint fencing to one RPC", async () => {
  let invocation: { name: string; args: unknown } | undefined;
  const repository = new SupabaseSyncRepository(
    mockClient((name, args) => {
      invocation = { name, args };
      return { data: [{ inserted: 1, duplicates: 0, input_revision: 8 }], error: null };
    }),
  );
  const event = toCommitPageEvent({
    provider: "listenbrainz",
    connectionGeneration: 5,
    listen: {
      recording: { title: "Glass Harbor", artistCredit: "North Meridian" },
      playedAtSec: 1790352000,
    },
  });
  const result = await repository.commitPage({
    jobId: "job",
    leaseToken: "lease",
    connectionGeneration: 5,
    expectedCheckpointRevision: 7,
    events: [event],
    nextCursor: { provider: "listenbrainz", beforeSec: 1790351999 },
    rangeComplete: false,
  });
  assert.deepEqual(result, { inserted: 1, duplicates: 0, inputRevision: 8 });
  assert.equal(invocation?.name, "commit_listening_page");
  assert.deepEqual(invocation?.args, {
    p_job_id: "job",
    p_lease_token: "lease",
    p_connection_generation: 5,
    p_expected_checkpoint_revision: 7,
    p_events: [event],
    p_next_continuation: { provider: "listenbrainz", beforeSec: 1790351999 },
    p_range_complete: false,
  });
});

test("complete commits cannot retain a continuation", async () => {
  const repository = new SupabaseSyncRepository(mockClient(() => ({ data: [], error: null })));
  await assert.rejects(
    repository.commitPage({
      jobId: "job",
      leaseToken: "lease",
      connectionGeneration: 1,
      expectedCheckpointRevision: 0,
      events: [],
      nextCursor: { provider: "lastfm", page: 2 },
      rangeComplete: true,
    }),
    /complete range/,
  );
});

test("repository errors do not expose database messages", async () => {
  const repository = new SupabaseSyncRepository(
    mockClient(() => ({ data: null, error: { message: "secret upstream detail", code: "40001" } })),
  );
  await assert.rejects(
    repository.claimDueJob("2026-09-01T00:00:00.000Z"),
    (error: Error & { code?: string }) => {
      assert.equal(error.message, "Listening repository claim failed");
      assert.equal(error.code, "40001");
      return true;
    },
  );
});

