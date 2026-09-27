import type { Affinity, DailyTrackInput, TasteScore } from "./types";

const DAY_MS = 86_400_000;
export const RECENT_HALF_LIFE_DAYS = 7;
export const CORE_HALF_LIFE_DAYS = 60;
export const DAILY_REPEAT_CAP = 5;
export const ARTIST_DOMINANCE_CAP = 0.4;

type MutableAffinity = {
  key: string;
  label: string;
  recentRaw: number;
  coreRaw: number;
  days: Set<string>;
  totalPlays: number;
  recent7Plays: number;
  previous7Plays: number;
};

export function scoreTaste(rows: DailyTrackInput[], asOfDate: string): TasteScore {
  const asOfDay = dayNumber(asOfDate);
  const valid = rows.filter((row) => {
    const age = asOfDay - dayNumber(row.localDate);
    return Number.isInteger(row.playCount) && row.playCount >= 0 && age >= 0;
  });
  const tracks = new Map<string, MutableAffinity>();
  const artists = new Map<string, MutableAffinity>();
  const observedDays = new Set<string>();
  let totalPlays = 0;
  let recent7Plays = 0;
  let previous7Plays = 0;

  for (const row of valid) {
    const ageDays = asOfDay - dayNumber(row.localDate);
    const capped = Math.log1p(Math.min(row.playCount, DAILY_REPEAT_CAP));
    const recentContribution = capped * decay(ageDays, RECENT_HALF_LIFE_DAYS);
    const coreContribution = capped * decay(ageDays, CORE_HALF_LIFE_DAYS);
    const recentPlays = ageDays < 7 ? row.playCount : 0;
    const previousPlays = ageDays >= 7 && ageDays < 14 ? row.playCount : 0;
    observedDays.add(row.localDate);
    totalPlays += row.playCount;
    recent7Plays += recentPlays;
    previous7Plays += previousPlays;
    add(tracks, row.trackId, row.title, row, recentContribution, coreContribution, recentPlays, previousPlays);
    add(artists, row.artistKey, row.artistCredit, row, recentContribution, coreContribution, recentPlays, previousPlays);
  }

  const dates = [...observedDays].sort();
  const coverageStart = dates[0] ?? null;
  const coverageEnd = dates.at(-1) ?? null;
  const spanDays = coverageStart && coverageEnd ? dayNumber(coverageEnd) - dayNumber(coverageStart) + 1 : 0;
  return {
    asOfDate,
    coverageStart,
    coverageEnd,
    coverageState: dates.length === 0 ? "empty" : spanDays < 28 || dates.length < 14 ? "short" : "established",
    totalPlays,
    distinctTracks: tracks.size,
    distinctArtists: artists.size,
    observedDays: dates.length,
    recent7Plays,
    previous7Plays,
    trackAffinities: finish(tracks, 1),
    artistAffinities: finish(artists, ARTIST_DOMINANCE_CAP),
  };
}

function add(
  target: Map<string, MutableAffinity>,
  key: string,
  label: string,
  row: DailyTrackInput,
  recent: number,
  core: number,
  recentPlays: number,
  previousPlays: number,
) {
  const value = target.get(key) ?? {
    key, label, recentRaw: 0, coreRaw: 0, days: new Set<string>(),
    totalPlays: 0, recent7Plays: 0, previous7Plays: 0,
  };
  value.recentRaw += recent;
  value.coreRaw += core;
  value.days.add(row.localDate);
  value.totalPlays += row.playCount;
  value.recent7Plays += recentPlays;
  value.previous7Plays += previousPlays;
  target.set(key, value);
}

function finish(values: Map<string, MutableAffinity>, cap: number): Affinity[] {
  const all = [...values.values()];
  const recent = cappedDistribution(all.map((value) => value.recentRaw), cap);
  const core = cappedDistribution(all.map((value) => value.coreRaw), cap);
  return all.map((value, index) => ({
    key: value.key,
    label: value.label,
    recentWeight: recent[index],
    coreWeight: core[index],
    evidenceDays: value.days.size,
    totalPlays: value.totalPlays,
    recent7Plays: value.recent7Plays,
    previous7Plays: value.previous7Plays,
  })).sort((a, b) => b.coreWeight - a.coreWeight || b.recentWeight - a.recentWeight || a.key.localeCompare(b.key));
}

export function cappedDistribution(raw: number[], cap: number): number[] {
  const total = raw.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return raw.map(() => 0);
  if (cap >= 1 || raw.length * cap < 1) return raw.map((value) => Math.max(0, value) / total);
  const output = raw.map(() => 0);
  const remaining = new Set(raw.map((_, index) => index));
  let mass = 1;
  while (remaining.size) {
    const remainingRaw = [...remaining].reduce((sum, index) => sum + Math.max(0, raw[index]), 0);
    if (remainingRaw <= 0) break;
    let cappedAny = false;
    for (const index of [...remaining]) {
      const share = mass * Math.max(0, raw[index]) / remainingRaw;
      if (share > cap) {
        output[index] = cap;
        mass -= cap;
        remaining.delete(index);
        cappedAny = true;
      }
    }
    if (!cappedAny) {
      for (const index of remaining) output[index] = mass * Math.max(0, raw[index]) / remainingRaw;
      break;
    }
  }
  return output;
}

function decay(ageDays: number, halfLifeDays: number): number {
  return 2 ** (-ageDays / halfLifeDays);
}

export function dayNumber(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid local date");
  const [year, month, day] = date.split("-").map(Number);
  const value = Date.UTC(year, month - 1, day) / DAY_MS;
  if (!Number.isInteger(value)) throw new Error("Invalid local date");
  return value;
}
