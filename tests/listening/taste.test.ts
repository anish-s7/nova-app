import assert from "node:assert/strict";
import test from "node:test";
import { buildArtistInterests } from "../../lib/taste/interests";
import { scoreTaste } from "../../lib/taste/score";
import { localDate } from "../../lib/taste/snapshots";
import type { DailyTrackInput } from "../../lib/taste/types";

test("daily repeat contribution caps at five plays", () => {
  const score = scoreTaste([
    row({ trackId: "a", artistKey: "a", playCount: 500 }),
    row({ trackId: "b", artistKey: "b", playCount: 5 }),
  ], "2026-09-27");
  assert.equal(score.trackAffinities[0].recentWeight, score.trackAffinities[1].recentWeight);
  assert.equal(score.totalPlays, 505);
});

test("elapsed time decays recent affinity faster than core affinity", () => {
  const score = scoreTaste([
    row({ trackId: "today", artistKey: "today", localDate: "2026-09-27" }),
    row({ trackId: "week", artistKey: "week", localDate: "2026-09-20" }),
  ], "2026-09-27");
  const today = score.trackAffinities.find((item) => item.key === "today")!;
  const week = score.trackAffinities.find((item) => item.key === "week")!;
  assert.ok(week.recentWeight < week.coreWeight);
  assert.ok(today.recentWeight > today.coreWeight);
});

test("artist dominance is capped while smaller interests remain visible", () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, index) => row({ trackId: `dominant-${index}`, artistKey: "dominant", artistCredit: "Dominant", localDate: `2026-09-${String(27 - (index % 10)).padStart(2, "0")}`, playCount: 5 })),
    row({ trackId: "ambient", artistKey: "ambient", artistCredit: "Ambient Thread", playCount: 2 }),
    row({ trackId: "metal", artistKey: "metal", artistCredit: "Metal Thread", playCount: 2 }),
  ];
  const score = scoreTaste(rows, "2026-09-27");
  assert.ok(score.artistAffinities.find((item) => item.key === "dominant")!.coreWeight <= 0.4000001);
  const interests = buildArtistInterests(rows, score);
  assert.ok(interests.some((interest) => interest.stableInterestKey === "artist:ambient"));
  assert.ok(interests.some((interest) => interest.stableInterestKey === "artist:metal"));
});

test("short history and weekly comparisons stay explicit", () => {
  const score = scoreTaste([
    row({ trackId: "current", artistKey: "current", localDate: "2026-09-27", playCount: 3 }),
    row({ trackId: "previous", artistKey: "previous", localDate: "2026-09-18", playCount: 2 }),
  ], "2026-09-27");
  assert.equal(score.coverageState, "short");
  assert.equal(score.recent7Plays, 3);
  assert.equal(score.previous7Plays, 2);
});

test("local dates honor DST boundaries in the selected IANA timezone", () => {
  assert.equal(localDate(new Date("2026-03-08T04:30:00Z"), "America/New_York"), "2026-03-07");
  assert.equal(localDate(new Date("2026-03-08T07:30:00Z"), "America/New_York"), "2026-03-08");
  assert.equal(localDate(new Date("2026-11-01T05:30:00Z"), "America/New_York"), "2026-11-01");
  assert.equal(localDate(new Date("2026-11-01T06:30:00Z"), "America/New_York"), "2026-11-01");
});

function row(overrides: Partial<DailyTrackInput>): DailyTrackInput {
  const trackId = overrides.trackId ?? "track";
  return {
    trackId,
    title: overrides.title ?? trackId,
    artistCredit: overrides.artistCredit ?? overrides.artistKey ?? "Artist",
    artistKey: overrides.artistKey ?? "artist",
    localDate: overrides.localDate ?? "2026-09-27",
    playCount: overrides.playCount ?? 1,
    distinctObservedTimestamps: overrides.distinctObservedTimestamps ?? 1,
  };
}
