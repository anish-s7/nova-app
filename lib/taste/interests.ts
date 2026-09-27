import type { DailyTrackInput, TasteInterest, TasteScore } from "./types";

const MAX_INTERESTS = 12;

export function buildArtistInterests(rows: DailyTrackInput[], score: TasteScore): TasteInterest[] {
  const tracksByArtist = new Map<string, Map<string, DailyTrackInput>>();
  for (const row of rows) {
    const tracks = tracksByArtist.get(row.artistKey) ?? new Map<string, DailyTrackInput>();
    tracks.set(row.trackId, row);
    tracksByArtist.set(row.artistKey, tracks);
  }
  const trackAffinity = new Map(score.trackAffinities.map((affinity) => [affinity.key, affinity]));
  return score.artistAffinities.slice(0, MAX_INTERESTS).map((artist) => {
    const rowsForArtist = [...(tracksByArtist.get(artist.key)?.values() ?? [])];
    const representativeTracks = rowsForArtist
      .map((row) => ({ row, affinity: trackAffinity.get(row.trackId) }))
      .filter((item): item is typeof item & { affinity: NonNullable<typeof item.affinity> } => Boolean(item.affinity))
      .sort((a, b) => b.affinity.coreWeight - a.affinity.coreWeight || b.affinity.recentWeight - a.affinity.recentWeight)
      .slice(0, 5)
      .map(({ row, affinity }) => ({
        trackId: row.trackId,
        title: row.title,
        artistCredit: row.artistCredit,
        recentWeight: affinity.recentWeight,
        coreWeight: affinity.coreWeight,
      }));
    const confidence = Math.min(1, 0.25 + 0.5 * Math.min(1, artist.evidenceDays / 7) + 0.25 * Math.min(1, artist.totalPlays / 10));
    return {
      stableInterestKey: `artist:${artist.key}`,
      label: artist.label,
      seedArtists: [{ key: artist.key, name: artist.label }],
      seedTracks: representativeTracks.slice(0, 3).map(({ trackId, title, artistCredit }) => ({ trackId, title, artistCredit })),
      recentWeight: artist.recentWeight,
      coreWeight: artist.coreWeight,
      confidence,
      evidenceDays: artist.evidenceDays,
      representativeTracks,
    };
  });
}
