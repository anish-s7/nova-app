export const DISCOVERY_ALGORITHM_VERSION = "public-picks-v1";

export type DiscoveryMode = "close" | "explore";
export type DiscoveryPool = "core" | "current" | "bridge" | "rediscovery";
export type CandidatePathType = "shared_public_pick" | "same_artist" | "public_overlap" | "own_rediscovery";

export type RawCandidatePath = {
  songId: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  spotifyTrackId: string | null;
  pathType: CandidatePathType;
  interestKey: string | null;
  interestWeight: number;
  anchorSongId: string | null;
  publicPickId: string | null;
  contributorProfileId: string | null;
  repeatDays: number;
  anchorStrength: number;
  listeningTrackId: string | null;
};

export type DiscoveryEvidence =
  | { kind: "shared_public_pick"; anchorSongId: string; contributingPublicPickIds: string[] }
  | { kind: "same_artist"; artist: string; interestKey: string; contributingPublicPickIds: string[] }
  | { kind: "public_overlap"; anchorSongId: string; contributingPublicPickIds: string[] }
  | { kind: "own_rediscovery" };

export type DiscoveryCandidate = {
  songId: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  spotifyTrackId: string | null;
  paths: RawCandidatePath[];
  interestKey: string | null;
  poolType: DiscoveryPool;
  componentScores: {
    interestRelevance: number;
    anchorStrength: number;
    repeatAcrossDays: number;
    socialBreadth: number;
    exposurePenalty: number;
    total: number;
  };
  evidence: DiscoveryEvidence;
  sourceAttribution: string;
};

export type RankedDiscoveryCandidate = DiscoveryCandidate & { rank: number };

export type DiscoverySongDto = {
  candidateId: string;
  rank: number;
  pool: DiscoveryPool;
  interestKey: string | null;
  song: { id: string; title: string; artist: string; albumArtUrl: string | null; spotifyId: string | null };
  reason: string;
  evidence: DiscoveryEvidence;
  sourceAttribution: string;
  saved: boolean;
};
