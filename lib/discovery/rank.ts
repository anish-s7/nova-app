import type { DiscoveryCandidate, DiscoveryMode, RankedDiscoveryCandidate } from "./types";

export function rankCandidates(input: {
  candidates: Omit<DiscoveryCandidate, "componentScores">[];
  mode: DiscoveryMode;
  exposureCounts?: Map<string, number>;
  dismissedSongIds?: Set<string>;
  savedSongIds?: Set<string>;
}): DiscoveryCandidate[] {
  const exposure = input.exposureCounts ?? new Map();
  const dismissed = input.dismissedSongIds ?? new Set();
  const saved = input.savedSongIds ?? new Set();
  return input.candidates
    .filter((candidate) => !saved.has(candidate.songId) && !dismissed.has(candidate.songId))
    .map((candidate) => {
      const interestRelevance = Math.min(1, Math.max(0, ...candidate.paths.map((path) => path.interestWeight)) / 0.4);
      const anchorStrength = Math.min(1, Math.max(0, ...candidate.paths.map((path) => path.anchorStrength)));
      const repeatAcrossDays = Math.min(1, Math.log1p(Math.max(0, ...candidate.paths.map((path) => path.repeatDays))) / Math.log(11));
      const contributors = new Set(candidate.paths.map((path) => path.contributorProfileId).filter(Boolean)).size;
      const socialBreadth = Math.min(1, contributors / 3);
      const exposurePenalty = Math.min(0.4, (exposure.get(candidate.songId) ?? 0) * 0.08);
      const weights = input.mode === "explore"
        ? { interest: 0.22, anchor: 0.28, repeat: 0.18, social: 0.32 }
        : { interest: 0.4, anchor: 0.32, repeat: 0.13, social: 0.15 };
      const total = weights.interest * interestRelevance + weights.anchor * anchorStrength + weights.repeat * repeatAcrossDays + weights.social * socialBreadth - exposurePenalty;
      return { ...candidate, componentScores: { interestRelevance, anchorStrength, repeatAcrossDays, socialBreadth, exposurePenalty, total } };
    })
    .sort((a, b) => b.componentScores.total - a.componentScores.total || a.songId.localeCompare(b.songId));
}

export function withRanks(candidates: DiscoveryCandidate[]): RankedDiscoveryCandidate[] {
  return candidates.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
