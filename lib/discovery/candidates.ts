import type { DiscoveryCandidate, DiscoveryEvidence, DiscoveryPool, RawCandidatePath } from "./types";

export type InterestWeights = Map<string, { recent: number; core: number }>;

export function combineCandidatePaths(paths: RawCandidatePath[], interests: InterestWeights): Omit<DiscoveryCandidate, "componentScores">[] {
  const grouped = new Map<string, RawCandidatePath[]>();
  for (const path of paths) grouped.set(path.songId, [...(grouped.get(path.songId) ?? []), path]);
  return [...grouped.values()].map((songPaths) => {
    const first = songPaths[0];
    const interestPath = [...songPaths].filter((path) => path.interestKey).sort((a, b) => b.interestWeight - a.interestWeight)[0];
    const poolType = poolFor(songPaths, interestPath?.interestKey ?? null, interests);
    return {
      songId: first.songId,
      title: first.title,
      artist: first.artist,
      albumArtUrl: first.albumArtUrl,
      spotifyTrackId: first.spotifyTrackId,
      paths: songPaths,
      interestKey: interestPath?.interestKey ?? null,
      poolType,
      evidence: evidenceFor(songPaths),
      sourceAttribution: songPaths.some((path) => path.pathType !== "own_rediscovery") ? "Public Nova picks" : "Your recorded listening history",
    };
  });
}

function poolFor(paths: RawCandidatePath[], interestKey: string | null, interests: InterestWeights): DiscoveryPool {
  if (paths.every((path) => path.pathType === "own_rediscovery")) return "rediscovery";
  if (interestKey) {
    const weights = interests.get(interestKey);
    if (weights && weights.recent > weights.core * 1.15) return "current";
    return "core";
  }
  return "bridge";
}

function evidenceFor(paths: RawCandidatePath[]): DiscoveryEvidence {
  const pickIds = [...new Set(paths.map((path) => path.publicPickId).filter((id): id is string => Boolean(id)))].slice(0, 20);
  const shared = paths.find((path) => path.pathType === "shared_public_pick" && path.anchorSongId);
  if (shared?.anchorSongId) return { kind: "shared_public_pick", anchorSongId: shared.anchorSongId, contributingPublicPickIds: pickIds };
  const sameArtist = paths.find((path) => path.pathType === "same_artist" && path.interestKey);
  if (sameArtist?.interestKey) return { kind: "same_artist", artist: sameArtist.artist, interestKey: sameArtist.interestKey, contributingPublicPickIds: pickIds };
  const overlap = paths.find((path) => path.pathType === "public_overlap" && path.anchorSongId);
  if (overlap?.anchorSongId) return { kind: "public_overlap", anchorSongId: overlap.anchorSongId, contributingPublicPickIds: pickIds };
  return { kind: "own_rediscovery" };
}
