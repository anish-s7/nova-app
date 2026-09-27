import { canonicalizeUsername } from "../identity";
import {
  ListeningProviderError,
  validateFetchPageInput,
  type FetchPageInput,
  type ListenPage,
  type ListeningAdapter,
  type ObservedListen,
} from "../types";
import { asRecord, httpError, nonEmptyString, readJson, retryAfterMs, type FetchLike } from "./http";

const API_URL = "https://ws.audioscrobbler.com/2.0/";
const PAGE_SIZE = 200;

type LastfmAdapterOptions = {
  apiKey: string;
  fetch?: FetchLike;
  now?: () => number;
};

export function createLastfmAdapter(options: LastfmAdapterOptions): ListeningAdapter {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new Error("A Last.fm API key is required");
  const fetcher = options.fetch ?? fetch;
  const now = options.now ?? Date.now;

  async function request(params: URLSearchParams, signal: AbortSignal): Promise<Record<string, unknown>> {
    params.set("api_key", apiKey);
    params.set("format", "json");
    let response: Response;
    try {
      response = await fetcher(`${API_URL}?${params}`, { signal, headers: { Accept: "application/json" } });
    } catch (cause) {
      if (signal.aborted) {
        throw new ListeningProviderError({ code: "request_timeout", message: "Last.fm request timed out", retryable: true, cause });
      }
      throw new ListeningProviderError({ code: "provider_unavailable", message: "Last.fm could not be reached", retryable: true, cause });
    }
    if (!response.ok) throw httpError(response, now());
    const body = asRecord(await readJson(response));
    if (!body) throw malformed("Last.fm returned an unexpected response");
    if (typeof body.error === "number" || typeof body.error === "string") {
      const code = Number(body.error);
      if (code === 6 || code === 7) {
        throw new ListeningProviderError({ code: "invalid_username", message: "That Last.fm username was not found", retryable: false });
      }
      if (code === 29) {
        throw new ListeningProviderError({ code: "rate_limited", message: "Last.fm rate limited the request", retryable: true, retryAfterMs: retryAfterMs(response, now()) });
      }
      throw new ListeningProviderError({
        code: code === 11 || code === 16 ? "provider_unavailable" : "malformed_response",
        message: "Last.fm rejected the request",
        retryable: code === 8 || code === 11 || code === 16,
      });
    }
    return body;
  }

  return {
    provider: "lastfm",
    async validateUsername(username, signal) {
      const requested = canonicalizeUsername(username);
      const body = await request(new URLSearchParams({ method: "user.getRecentTracks", user: requested, limit: "1", page: "1" }), signal);
      const recent = asRecord(body.recenttracks);
      if (!recent) throw malformed("Last.fm omitted recent tracks");
      const attr = asRecord(recent["@attr"]);
      return canonicalizeUsername(nonEmptyString(attr?.user) ?? requested);
    },
    async fetchPage(input: FetchPageInput): Promise<ListenPage> {
      validateFetchPageInput("lastfm", input);
      const page = input.cursor?.provider === "lastfm" ? input.cursor.page : 1;
      const body = await request(
        new URLSearchParams({
          method: "user.getRecentTracks",
          user: input.username,
          from: String(input.lowerInclusiveSec),
          // Last.fm's upper bound is documented as "before" but observed APIs vary;
          // filtering below is authoritative for our half-open range.
          to: String(input.upperExclusiveSec),
          limit: String(PAGE_SIZE),
          page: String(page),
          extended: "0",
        }),
        input.signal,
      );
      const recent = asRecord(body.recenttracks);
      const attr = asRecord(recent?.["@attr"]);
      const rawTracks = asRecord(recent?.track) ? [recent?.track] : recent?.track;
      if (!recent || !attr || !Array.isArray(rawTracks)) throw malformed("Last.fm returned malformed recent tracks");
      const totalPages = integer(attr.totalPages);
      const currentPage = integer(attr.page);
      if (totalPages === undefined || currentPage === undefined) throw malformed("Last.fm omitted pagination metadata");

      const events: ObservedListen[] = [];
      for (const raw of rawTracks) {
        const track = asRecord(raw);
        if (!track) throw malformed("Last.fm returned a malformed track");
        const nowPlaying = asRecord(track["@attr"])?.nowplaying === "true";
        if (nowPlaying) continue;
        const date = asRecord(track.date);
        const playedAtSec = integer(date?.uts);
        const artist = asRecord(track.artist);
        const title = nonEmptyString(track.name);
        const artistCredit = nonEmptyString(artist?.["#text"]);
        if (playedAtSec === undefined || !title || !artistCredit) throw malformed("Last.fm returned incomplete track metadata");
        if (playedAtSec < input.lowerInclusiveSec || playedAtSec >= input.upperExclusiveSec) continue;
        events.push({
          playedAtSec,
          recording: {
            title,
            artistCredit,
            album: nonEmptyString(asRecord(track.album)?.["#text"]),
            recordingMbid: nonEmptyString(track.mbid),
          },
        });
      }
      const rangeComplete = currentPage >= totalPages;
      return { events, rangeComplete, nextCursor: rangeComplete ? null : { provider: "lastfm", page: currentPage + 1 } };
    },
  };
}

function integer(value: unknown): number | undefined {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function malformed(message: string): ListeningProviderError {
  return new ListeningProviderError({ code: "malformed_response", message, retryable: true });
}
