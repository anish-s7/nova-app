import assert from "node:assert/strict";
import test from "node:test";
import { assertCursorForProvider, validateFetchPageInput } from "../../lib/listening/types";

test("cursor provider must match its adapter", () => {
  assert.doesNotThrow(() => assertCursorForProvider("lastfm", { provider: "lastfm", page: 1 }));
  assert.throws(
    () => assertCursorForProvider("listenbrainz", { provider: "lastfm", page: 1 }),
    /does not match/,
  );
});

test("fixed provider ranges are half-open and ordered", () => {
  const signal = new AbortController().signal;
  assert.doesNotThrow(() =>
    validateFetchPageInput("listenbrainz", {
      username: "fixture-user",
      lowerInclusiveSec: 100,
      upperExclusiveSec: 200,
      cursor: { provider: "listenbrainz", beforeSec: 199, boundarySeen: ["one"] },
      signal,
    }),
  );
  assert.throws(
    () =>
      validateFetchPageInput("lastfm", {
        username: "fixture-user",
        lowerInclusiveSec: 200,
        upperExclusiveSec: 200,
        cursor: null,
        signal,
      }),
    /fixed listening range/,
  );
});

test("ListenBrainz boundary recovery state is bounded", () => {
  assert.throws(
    () =>
      assertCursorForProvider("listenbrainz", {
        provider: "listenbrainz",
        beforeSec: 100,
        boundarySeen: Array.from({ length: 1001 }, (_, index) => String(index)),
      }),
    /boundary cursor/,
  );
});

