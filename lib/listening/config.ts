export const LISTENING_CONSENT_VERSION = "listening-v1";
export const LISTENING_INITIAL_HISTORY_DAYS = 90;
export const LISTENING_RAW_RETENTION_DAYS = 120;
export const LISTENING_RECENT_RECONCILE_HOURS = 48;
export const LISTENING_WORKER_PAGE_LIMIT = 5;
export const LISTENING_WORKER_BUDGET_MS = 15_000;

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function listeningEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return enabled(env.LISTENING_ENABLED);
}

export function discoveryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return enabled(env.DISCOVERY_ENABLED);
}

export function requireLastfmApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env.LASTFM_API_KEY?.trim();
  if (!key) throw new Error("LASTFM_API_KEY is required for Last.fm imports");
  return key;
}

