import assert from "node:assert/strict";
import test from "node:test";
import fixture from "../fixtures/listening/history.json";
import {
  canonicalizeUsername,
  listenIdempotencyFingerprint,
  normalizeArtistKey,
  recordingIdentityFingerprint,
} from "../../lib/listening/identity";
import type { ObservedListen } from "../../lib/listening/types";

function asListen(row: (typeof fixture)[number]): ObservedListen {
  return {
    recording: {
      title: row.title,
      artistCredit: row.artistCredit,
      ...(row.album ? { album: row.album } : {}),
      ...(row.versionHint ? { versionHint: row.versionHint } : {}),
    },
    playedAtSec: row.playedAtSec,
    providerEventId: row.providerEventId,
  };
}

test("the ten-listen fixture remains ten distinct source events on replay", () => {
  const first = fixture.map((row) =>
    listenIdempotencyFingerprint({ provider: "lastfm", connectionGeneration: 1, listen: asListen(row) }),
  );
  const replay = fixture.map((row) =>
    listenIdempotencyFingerprint({ provider: "lastfm", connectionGeneration: 1, listen: asListen(row) }),
  );
  assert.equal(new Set(first).size, 10);
  assert.deepEqual(replay, first);
});

test("real repeats at different timestamps remain distinct without provider IDs", () => {
  const base: ObservedListen = {
    recording: { title: "Quiet Engines", artistCredit: "Mara Vale" },
    playedAtSec: 100,
  };
  const fingerprints = [100, 101, 102].map((playedAtSec) =>
    listenIdempotencyFingerprint({
      provider: "listenbrainz",
      connectionGeneration: 4,
      listen: { ...base, playedAtSec },
    }),
  );
  assert.equal(new Set(fingerprints).size, 3);
});

test("indistinguishable same-second rows intentionally collapse", () => {
  const listen: ObservedListen = {
    recording: { title: "Same Second", artistCredit: "One Artist" },
    playedAtSec: 100,
  };
  const one = listenIdempotencyFingerprint({ provider: "listenbrainz", connectionGeneration: 1, listen });
  const two = listenIdempotencyFingerprint({ provider: "listenbrainz", connectionGeneration: 1, listen });
  assert.equal(one, two);
});

test("versions and full multi-artist credits remain part of conservative identity", () => {
  const studio = recordingIdentityFingerprint({ title: "Signal Fires", artistCredit: "Mara Vale & Low Orbit" });
  const live = recordingIdentityFingerprint({
    title: "Signal Fires",
    artistCredit: "Mara Vale & Low Orbit",
    versionHint: "Live",
  });
  assert.notEqual(studio, live);
  assert.equal(normalizeArtistKey("  Mara Vale &   Low Orbit "), "mara vale & low orbit");
});

test("usernames are canonicalized without pretending they are verified", () => {
  assert.equal(canonicalizeUsername("  fixture-user  "), "fixture-user");
  assert.throws(() => canonicalizeUsername("bad\nuser"), /Invalid listening username/);
});

