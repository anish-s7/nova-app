import { createHash } from "node:crypto";
import type { ListeningProvider, ObservedListen, RecordingIdentity } from "./types";

const MAX_TEXT_LENGTH = 500;

function normalizedText(value: string, field: string): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (normalized.length === 0 || normalized.length > MAX_TEXT_LENGTH) {
    throw new Error(`Invalid ${field}`);
  }
  return normalized.toLocaleLowerCase("en-US");
}

function optionalNormalizedText(value: string | undefined, field: string): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return normalizedText(value, field);
}

export function normalizeArtistKey(artistCredit: string): string {
  // Deliberately keep the complete credited string. Splitting on "feat.", commas,
  // or ampersands would invent artist identities and merge distinct credits.
  return normalizedText(artistCredit, "artist credit");
}

export function recordingIdentityFingerprint(recording: RecordingIdentity): string {
  const identity = {
    title: normalizedText(recording.title, "title"),
    artistCredit: normalizeArtistKey(recording.artistCredit),
    album: optionalNormalizedText(recording.album, "album"),
    recordingMbid: optionalNormalizedText(recording.recordingMbid, "recording MBID"),
    providerTrackId: optionalNormalizedText(recording.providerTrackId, "provider track ID"),
    versionHint: optionalNormalizedText(recording.versionHint, "version hint"),
  };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

export function listenIdempotencyFingerprint(input: {
  provider: ListeningProvider;
  connectionGeneration: number;
  listen: ObservedListen;
}): string {
  if (!Number.isSafeInteger(input.connectionGeneration) || input.connectionGeneration < 1) {
    throw new Error("Invalid connection generation");
  }
  if (!Number.isSafeInteger(input.listen.playedAtSec) || input.listen.playedAtSec < 0) {
    throw new Error("Invalid listen timestamp");
  }

  const stableIdentity = input.listen.providerEventId?.trim()
    ? `event:${normalizedText(input.listen.providerEventId, "provider event ID")}`
    : `recording:${recordingIdentityFingerprint(input.listen.recording)}`;

  return createHash("sha256")
    .update(
      [input.provider, input.connectionGeneration, input.listen.playedAtSec, stableIdentity].join("\u0000"),
    )
    .digest("hex");
}

export function canonicalizeUsername(username: string): string {
  const canonical = username.normalize("NFKC").trim();
  if (canonical.length === 0 || canonical.length > 128 || /[\u0000-\u001f\u007f]/.test(canonical)) {
    throw new Error("Invalid listening username");
  }
  return canonical;
}

