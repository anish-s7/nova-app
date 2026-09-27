import { canonicalizeUsername, recordingIdentityFingerprint } from "../identity";
import {
  ListeningProviderError,
  validateFetchPageInput,
  type FetchPageInput,
  type ListenPage,
  type ListeningAdapter,
  type ObservedListen,
} from "../types";
import { asRecord, httpError, nonEmptyString, readJson, type FetchLike } from "./http";

const API_URL = "https://api.listenbrainz.org/1";
const PAGE_SIZE = 1000;

type ListenbrainzAdapterOptions = { fetch?: FetchLike; now?: () => number };

export function createListenbrainzAdapter(options: ListenbrainzAdapterOptions = {}): ListeningAdapter {
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;

  async function request(path: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetcher(`${API_URL}${path}`, {
        signal,
        headers: { Accept: "application/json", "User-Agent": "SongGalaxy/0.1" },
      });
    } catch (cause) {
      if (signal.aborted) throw new ListeningProviderError({ code: "request_timeout", message: "ListenBrainz request timed out", retryable: true, cause });
      throw new ListeningProviderError({ code: "provider_unavailable", message: "ListenBrainz could not be reached", retryable: true, cause });
    }
    if (!response.ok) throw httpError(response, now());
    const body = asRecord(await readJson(response));
    if (!body) throw malformed("ListenBrainz returned an unexpected response");
    return body;
  }

  return {
    provider: "listenbrainz",
    async validateUsername(username, signal) {
      const canonical = canonicalizeUsername(username);
      await request(`/user/${encodeURIComponent(canonical)}/listen-count`, signal);
      return canonical;
    },
    async fetchPage(input: FetchPageInput): Promise<ListenPage> {
      validateFetchPageInput("listenbrainz", input);
      const cursor = input.cursor?.provider === "listenbrainz" ? input.cursor : null;
      const beforeSec = cursor?.beforeSec ?? input.upperExclusiveSec;
      const body = await request(
        `/user/${encodeURIComponent(input.username)}/listens?max_ts=${beforeSec}&count=${PAGE_SIZE}`,
        input.signal,
      );
      const payload = asRecord(body.payload);
      const listens = payload?.listens;
      if (!Array.isArray(listens)) throw malformed("ListenBrainz omitted listens");
      const parsed = listens.map(parseListen);
      const inRange = parsed.filter((listen) => listen.playedAtSec >= input.lowerInclusiveSec && listen.playedAtSec < input.upperExclusiveSec);
      const seen = new Set(cursor?.boundarySeen ?? []);
      const events = inRange.filter((listen) => !(listen.playedAtSec === beforeSec - 1 && seen.has(eventKey(listen))));

      if (parsed.length < PAGE_SIZE || parsed.length === 0) {
        return { events, nextCursor: null, rangeComplete: true };
      }
      const oldestSec = Math.min(...parsed.map((listen) => listen.playedAtSec));
      if (oldestSec < input.lowerInclusiveSec) return { events, nextCursor: null, rangeComplete: true };
      const boundary = parsed.filter((listen) => listen.playedAtSec === oldestSec).map(eventKey);
      const nextSeen = oldestSec === beforeSec - 1 ? [...seen, ...boundary] : boundary;
      const uniqueSeen = [...new Set(nextSeen)];
      if (uniqueSeen.length >= PAGE_SIZE && parsed.every((listen) => listen.playedAtSec === oldestSec)) {
        throw new ListeningProviderError({
          code: "malformed_response",
          message: "ListenBrainz has more same-second listens than its page can safely represent",
          retryable: false,
        });
      }
      return {
        events,
        rangeComplete: false,
        nextCursor: { provider: "listenbrainz", beforeSec: oldestSec + 1, boundarySeen: uniqueSeen },
      };
    },
  };
}

function parseListen(value: unknown): ObservedListen {
  const listen = asRecord(value);
  const metadata = asRecord(listen?.track_metadata);
  const additional = asRecord(metadata?.additional_info);
  const mapping = asRecord(metadata?.mbid_mapping);
  const playedAtSec = listen?.listened_at;
  const title = nonEmptyString(metadata?.track_name);
  const artistCredit = nonEmptyString(metadata?.artist_name);
  if (!Number.isSafeInteger(playedAtSec) || (playedAtSec as number) < 0 || !title || !artistCredit) {
    throw malformed("ListenBrainz returned incomplete listen metadata");
  }
  return {
    playedAtSec: playedAtSec as number,
    providerEventId: nonEmptyString(listen?.recording_msid),
    recording: {
      title,
      artistCredit,
      album: nonEmptyString(metadata?.release_name),
      recordingMbid: nonEmptyString(mapping?.recording_mbid) ?? nonEmptyString(additional?.recording_mbid),
      providerTrackId: nonEmptyString(listen?.recording_msid),
    },
  };
}

function eventKey(listen: ObservedListen): string {
  return listen.providerEventId?.trim() || recordingIdentityFingerprint(listen.recording);
}

function malformed(message: string): ListeningProviderError {
  return new ListeningProviderError({ code: "malformed_response", message, retryable: true });
}
