import { createLastfmAdapter } from "./providers/lastfm";
import { createListenbrainzAdapter } from "./providers/listenbrainz";
import { ListeningProviderError, type ListeningAdapter, type ListeningProvider } from "./types";

export type AdapterRegistry = Record<ListeningProvider, ListeningAdapter>;

export function createListeningAdapters(env: NodeJS.ProcessEnv = process.env): AdapterRegistry {
  const lastfmKey = env.LASTFM_API_KEY?.trim();
  return {
    lastfm: lastfmKey ? createLastfmAdapter({ apiKey: lastfmKey }) : unavailableLastfm,
    listenbrainz: createListenbrainzAdapter(),
  };
}

const unavailableLastfm: ListeningAdapter = {
  provider: "lastfm",
  validateUsername: unavailable,
  fetchPage: unavailable,
};

async function unavailable(): Promise<never> {
  throw new ListeningProviderError({
    code: "provider_unavailable",
    message: "Last.fm imports are not configured",
    retryable: false,
  });
}
