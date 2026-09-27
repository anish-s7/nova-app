export const TASTE_ALGORITHM_VERSION = "artist-affinity-v1";

export type DailyTrackInput = {
  trackId: string;
  title: string;
  artistCredit: string;
  artistKey: string;
  localDate: string;
  playCount: number;
  distinctObservedTimestamps: number;
};

export type Affinity = {
  key: string;
  label: string;
  recentWeight: number;
  coreWeight: number;
  evidenceDays: number;
  totalPlays: number;
  recent7Plays: number;
  previous7Plays: number;
};

export type TasteInterest = {
  stableInterestKey: string;
  label: string;
  seedArtists: { key: string; name: string }[];
  seedTracks: { trackId: string; title: string; artistCredit: string }[];
  recentWeight: number;
  coreWeight: number;
  confidence: number;
  evidenceDays: number;
  representativeTracks: {
    trackId: string;
    title: string;
    artistCredit: string;
    recentWeight: number;
    coreWeight: number;
  }[];
};

export type TasteScore = {
  asOfDate: string;
  coverageStart: string | null;
  coverageEnd: string | null;
  coverageState: "empty" | "short" | "established";
  totalPlays: number;
  distinctTracks: number;
  distinctArtists: number;
  observedDays: number;
  recent7Plays: number;
  previous7Plays: number;
  trackAffinities: Affinity[];
  artistAffinities: Affinity[];
};
