import assert from "node:assert/strict";
import test from "node:test";
import { createLastfmAdapter } from "../../lib/listening/providers/lastfm";
import { createListenbrainzAdapter } from "../../lib/listening/providers/listenbrainz";
import { ListeningProviderError } from "../../lib/listening/types";

const signal = new AbortController().signal;
const response = (body: unknown, init?: ResponseInit) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" }, ...init }));

test("Last.fm classifies HTTP-200 API errors without leaking the provider payload", async () => {
  const adapter = createLastfmAdapter({ apiKey: "test", fetch: () => response({ error: 6, message: "User not found: secret" }) });
  await assert.rejects(adapter.validateUsername("missing", signal), (error: ListeningProviderError) => {
    assert.equal(error.code, "invalid_username");
    assert.equal(error.retryable, false);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
});

test("Last.fm excludes now-playing and filters provider boundary drift", async () => {
  let requested = "";
  const adapter = createLastfmAdapter({
    apiKey: "test",
    fetch: (url) => {
      requested = String(url);
      return response({ recenttracks: { "@attr": { page: "1", totalPages: "2" }, track: [
        { name: "Still playing", artist: { "#text": "A" }, "@attr": { nowplaying: "true" } },
        { name: "Inside", artist: { "#text": "A & B" }, album: { "#text": "Record" }, mbid: "mbid", date: { uts: "150" } },
        { name: "Upper edge", artist: { "#text": "A" }, date: { uts: "200" } },
      ] } });
    },
  });
  const page = await adapter.fetchPage({ username: "user", lowerInclusiveSec: 100, upperExclusiveSec: 200, cursor: null, signal });
  assert.equal(page.events.length, 1);
  assert.equal(page.events[0].recording.artistCredit, "A & B");
  assert.deepEqual(page.nextCursor, { provider: "lastfm", page: 2 });
  assert.match(requested, /from=100/);
  assert.match(requested, /to=200/);
});

test("ListenBrainz uses one exclusive max_ts and preserves versioned metadata", async () => {
  let requested = "";
  const adapter = createListenbrainzAdapter({ fetch: (url) => {
    requested = String(url);
    return response({ payload: { listens: [{
      listened_at: 199,
      recording_msid: "msid-1",
      track_metadata: {
        track_name: "Night Drive (Live)", artist_name: "One, Two & Three", release_name: "On Stage",
        mbid_mapping: { recording_mbid: "recording-mbid" },
      },
    }] } });
  } });
  const page = await adapter.fetchPage({ username: "user/name", lowerInclusiveSec: 100, upperExclusiveSec: 200, cursor: null, signal });
  assert.equal(page.rangeComplete, true);
  assert.equal(page.events[0].providerEventId, "msid-1");
  assert.equal(page.events[0].recording.recordingMbid, "recording-mbid");
  assert.match(requested, /user\/user%2Fname\/listens\?max_ts=200&count=1000/);
  assert.doesNotMatch(requested, /min_ts/);
});

test("ListenBrainz refetches and deduplicates a full oldest timestamp boundary", async () => {
  const first = Array.from({ length: 999 }, (_, index) => lbListen(101 + (index % 99), `new-${index}`));
  first.push(lbListen(100, "boundary"));
  const second = [lbListen(100, "boundary"), ...Array.from({ length: 10 }, (_, index) => lbListen(99 - index, `older-${index}`))];
  let calls = 0;
  const adapter = createListenbrainzAdapter({ fetch: () => response({ payload: { listens: calls++ === 0 ? first : second } }) });
  const page1 = await adapter.fetchPage({ username: "user", lowerInclusiveSec: 1, upperExclusiveSec: 500, cursor: null, signal });
  assert.deepEqual(page1.nextCursor, { provider: "listenbrainz", beforeSec: 101, boundarySeen: ["boundary"] });
  const page2 = await adapter.fetchPage({ username: "user", lowerInclusiveSec: 1, upperExclusiveSec: 500, cursor: page1.nextCursor, signal });
  assert.equal(page2.events.some((event) => event.providerEventId === "boundary"), false);
  assert.equal(page2.events.length, 10);
  assert.equal(page2.rangeComplete, true);
});

test("malformed and future ListenBrainz timestamps cannot enter a fixed range", async () => {
  const malformed = createListenbrainzAdapter({ fetch: () => response({ payload: { listens: [lbListen("tomorrow", "bad")] } }) });
  await assert.rejects(malformed.fetchPage({ username: "user", lowerInclusiveSec: 1, upperExclusiveSec: 200, cursor: null, signal }), /incomplete listen metadata/);
  const future = createListenbrainzAdapter({ fetch: () => response({ payload: { listens: [lbListen(300, "future"), lbListen(150, "inside")] } }) });
  const page = await future.fetchPage({ username: "user", lowerInclusiveSec: 1, upperExclusiveSec: 200, cursor: null, signal });
  assert.deepEqual(page.events.map((event) => event.providerEventId), ["inside"]);
});

function lbListen(timestamp: number | string, id: string) {
  return { listened_at: timestamp, recording_msid: id, track_metadata: { track_name: `Track ${id}`, artist_name: "Artist" } };
}
