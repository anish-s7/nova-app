import type { DiscoveryEvidence } from "./types";

export function parseDiscoveryEvidence(value: unknown): DiscoveryEvidence | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.kind === "own_rediscovery") return { kind: "own_rediscovery" };
  const picks = stringArray(row.contributingPublicPickIds);
  if (!picks) return null;
  if (row.kind === "same_artist" && typeof row.artist === "string" && typeof row.interestKey === "string") {
    return { kind: "same_artist", artist: row.artist, interestKey: row.interestKey, contributingPublicPickIds: picks };
  }
  if ((row.kind === "shared_public_pick" || row.kind === "public_overlap") && typeof row.anchorSongId === "string") {
    return { kind: row.kind, anchorSongId: row.anchorSongId, contributingPublicPickIds: picks };
  }
  return null;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every((item) => typeof item === "string") ? value : null;
}

export function evidenceText(evidence: DiscoveryEvidence, input: { songTitle: string; anchorTitles?: Map<string, string> }): string {
  if (evidence.kind === "same_artist") return `A less familiar track by ${evidence.artist}, one of your current artist interests.`;
  if (evidence.kind === "own_rediscovery") return `From your earlier recorded listening, outside your recent rotation.`;
  const anchor = input.anchorTitles?.get(evidence.anchorSongId) ?? "a song you know";
  if (evidence.kind === "shared_public_pick") return `People who publicly picked “${anchor}” also picked “${input.songTitle}.”`;
  return `A public-pick path from “${anchor}” leads to this song.`;
}

export function publicEvidencePickIds(evidence: DiscoveryEvidence): string[] {
  return evidence.kind === "own_rediscovery" ? [] : evidence.contributingPublicPickIds;
}
