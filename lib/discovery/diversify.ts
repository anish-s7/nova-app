import type { DiscoveryCandidate, DiscoveryPool } from "./types";

const TARGET: Record<DiscoveryPool, number> = { core: 12, current: 6, bridge: 4, rediscovery: 2 };

export function diversifyCandidates(candidates: DiscoveryCandidate[], limit = 24, artistCap = 2): DiscoveryCandidate[] {
  const selected: DiscoveryCandidate[] = [];
  const selectedIds = new Set<string>();
  const artistCounts = new Map<string, number>();
  const canTake = (candidate: DiscoveryCandidate) => !selectedIds.has(candidate.songId) && (artistCounts.get(artistKey(candidate.artist)) ?? 0) < artistCap;
  const take = (candidate: DiscoveryCandidate) => {
    selected.push(candidate);
    selectedIds.add(candidate.songId);
    const key = artistKey(candidate.artist);
    artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
  };

  // Give every sufficiently supported interest one place before dominant interests fill the batch.
  const byInterest = new Map<string, DiscoveryCandidate[]>();
  for (const candidate of candidates) if (candidate.interestKey) byInterest.set(candidate.interestKey, [...(byInterest.get(candidate.interestKey) ?? []), candidate]);
  for (const group of byInterest.values()) {
    const candidate = group.find(canTake);
    if (candidate && selected.length < limit) take(candidate);
  }

  for (const pool of ["core", "current", "bridge", "rediscovery"] as const) {
    let inPool = selected.filter((candidate) => candidate.poolType === pool).length;
    for (const candidate of candidates) {
      if (selected.length >= limit || inPool >= TARGET[pool]) break;
      if (candidate.poolType === pool && canTake(candidate)) {
        take(candidate);
        inPool += 1;
      }
    }
  }
  for (const candidate of candidates) {
    if (selected.length >= limit) break;
    if (canTake(candidate)) take(candidate);
  }
  return selected;
}

function artistKey(artist: string) {
  return artist.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}
