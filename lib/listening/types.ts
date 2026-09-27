export const LISTENING_PROVIDERS = ["lastfm", "listenbrainz"] as const;

export type ListeningProvider = (typeof LISTENING_PROVIDERS)[number];

export type RecordingIdentity = {
  title: string;
  artistCredit: string;
  album?: string;
  recordingMbid?: string;
  providerTrackId?: string;
  versionHint?: string;
};

export type ObservedListen = {
  recording: RecordingIdentity;
  /** Provider playback timestamp in Unix seconds. */
  playedAtSec: number;
  providerEventId?: string;
};

export type LastfmSyncCursor = {
  provider: "lastfm";
  page: number;
};

export type ListenbrainzSyncCursor = {
  provider: "listenbrainz";
  beforeSec: number;
  /** IDs/fingerprints already consumed at beforeSec while recovering a boundary group. */
  boundarySeen?: string[];
};

export type SyncCursor = LastfmSyncCursor | ListenbrainzSyncCursor;

export type FetchPageInput = {
  username: string;
  lowerInclusiveSec: number;
  upperExclusiveSec: number;
  cursor: SyncCursor | null;
  signal: AbortSignal;
};

export type ListenPage = {
  events: ObservedListen[];
  nextCursor: SyncCursor | null;
  rangeComplete: boolean;
  retryAfterMs?: number;
};

export interface ListeningAdapter {
  provider: ListeningProvider;
  validateUsername(username: string, signal: AbortSignal): Promise<string>;
  fetchPage(input: FetchPageInput): Promise<ListenPage>;
}

export type ListeningProviderErrorCode =
  | "invalid_username"
  | "rate_limited"
  | "provider_unavailable"
  | "malformed_response"
  | "request_timeout";

export class ListeningProviderError extends Error {
  readonly code: ListeningProviderErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(input: {
    code: ListeningProviderErrorCode;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "ListeningProviderError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.retryAfterMs = input.retryAfterMs;
  }
}

export function isListeningProvider(value: unknown): value is ListeningProvider {
  return typeof value === "string" && LISTENING_PROVIDERS.includes(value as ListeningProvider);
}

export function assertCursorForProvider(
  provider: ListeningProvider,
  cursor: SyncCursor | null,
): void {
  if (cursor === null) return;
  if (cursor.provider !== provider) {
    throw new Error(`Cursor provider does not match ${provider}`);
  }
  if (cursor.provider === "lastfm") {
    if (!Number.isSafeInteger(cursor.page) || cursor.page < 1) {
      throw new Error("Invalid Last.fm page cursor");
    }
    return;
  }
  if (!Number.isSafeInteger(cursor.beforeSec) || cursor.beforeSec < 0) {
    throw new Error("Invalid ListenBrainz timestamp cursor");
  }
  if (
    cursor.boundarySeen !== undefined &&
    (!Array.isArray(cursor.boundarySeen) ||
      cursor.boundarySeen.length > 1000 ||
      cursor.boundarySeen.some((value) => typeof value !== "string" || value.length > 500))
  ) {
    throw new Error("Invalid ListenBrainz boundary cursor");
  }
}

export function validateFetchPageInput(
  provider: ListeningProvider,
  input: FetchPageInput,
): void {
  if (!input.username.trim() || input.username.length > 128) {
    throw new Error("Invalid listening username");
  }
  if (
    !Number.isSafeInteger(input.lowerInclusiveSec) ||
    !Number.isSafeInteger(input.upperExclusiveSec) ||
    input.lowerInclusiveSec < 0 ||
    input.lowerInclusiveSec >= input.upperExclusiveSec
  ) {
    throw new Error("Invalid fixed listening range");
  }
  assertCursorForProvider(provider, input.cursor);
}

