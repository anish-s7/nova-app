import assert from "node:assert/strict";
import test from "node:test";
import { diversifyCandidates } from "../../lib/discovery/diversify";
import { evidenceText, parseDiscoveryEvidence, publicEvidencePickIds } from "../../lib/discovery/evidence";
import { rankCandidates } from "../../lib/discovery/rank";
import type { DiscoveryCandidate, DiscoveryEvidence, RawCandidatePath } from "../../lib/discovery/types";

test("ranking suppresses saved and dismissed songs and penalizes prior exposure", () => {
  const ranked = rankCandidates({
    candidates: [candidate("fresh", "Artist A", "interest:a"), candidate("seen", "Artist B", "interest:b"), candidate("saved", "Artist C", "interest:c"), candidate("dismissed", "Artist D", "interest:d")],
    mode: "close",
    exposureCounts: new Map([["seen", 4]]),
    savedSongIds: new Set(["saved"]),
    dismissedSongIds: new Set(["dismissed"]),
  });
  assert.deepEqual(ranked.map((item) => item.songId), ["fresh", "seen"]);
  assert.ok(ranked[0].componentScores.total > ranked[1].componentScores.total);
});

test("diversification represents smaller interests and caps each artist", () => {
  const ranked = rankCandidates({
    candidates: [
      candidate("a1", "Dominant", "interest:dominant", 1),
      candidate("a2", "Dominant", "interest:dominant", 0.95),
      candidate("a3", "Dominant", "interest:dominant", 0.9),
      candidate("b1", "Small B", "interest:b", 0.3),
      candidate("c1", "Small C", "interest:c", 0.2),
    ],
    mode: "close",
  });
  const selected = diversifyCandidates(ranked, 5, 2);
  assert.deepEqual(new Set(selected.map((item) => item.interestKey)), new Set(["interest:dominant", "interest:b", "interest:c"]));
  assert.equal(selected.filter((item) => item.artist === "Dominant").length, 2);
});

test("evidence copy only states auditable catalog facts", () => {
  const evidence: DiscoveryEvidence = { kind: "shared_public_pick", anchorSongId: "anchor", contributingPublicPickIds: ["pick-1"] };
  const copy = evidenceText(evidence, { songTitle: "Candidate", anchorTitles: new Map([["anchor", "Known Song"]]) });
  assert.equal(copy, "People who publicly picked “Known Song” also picked “Candidate.”");
  assert.doesNotMatch(copy, /sounds? like|acoustic|mood|similar/i);
  assert.deepEqual(publicEvidencePickIds(evidence), ["pick-1"]);
  assert.deepEqual(publicEvidencePickIds({ kind: "own_rediscovery" }), []);
  assert.equal(parseDiscoveryEvidence({ kind: "same_artist", artist: "Artist", interestKey: "interest", contributingPublicPickIds: [] }), null);
});

function candidate(songId: string, artist: string, interestKey: string, interestWeight = 0.5): Omit<DiscoveryCandidate, "componentScores"> {
  const path: RawCandidatePath = {
    songId, title: songId, artist, albumArtUrl: null, spotifyTrackId: null,
    pathType: "same_artist", interestKey, interestWeight, anchorSongId: null,
    publicPickId: `pick-${songId}`, contributorProfileId: `profile-${songId}`,
    repeatDays: 0, anchorStrength: 0.45, listeningTrackId: null,
  };
  return {
    songId, title: songId, artist, albumArtUrl: null, spotifyTrackId: null,
    paths: [path], interestKey, poolType: "core",
    evidence: { kind: "same_artist", artist, interestKey, contributingPublicPickIds: [path.publicPickId!] },
    sourceAttribution: "Public Song Galaxy picks",
  };
}
