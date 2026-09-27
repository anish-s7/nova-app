const MUSICBRAINZ_BASE_URL = "https://musicbrainz.org/ws/2/recording/";
const MIN_REQUEST_INTERVAL_MS = 1000; // MusicBrainz rate limit: 1 req/sec
const CONFIDENCE_THRESHOLD = 0.85; // below this, caller should fall back to Gemini

// MusicBrainz requires a descriptive User-Agent with real contact info and
// may block requests without one. The email comes from an env var, not a
// literal here, since this file is in a public repo — see .env.local.example.
function buildUserAgent() {
  const contact = process.env.MUSICBRAINZ_CONTACT_EMAIL;
  if (!contact) {
    throw new Error("Missing MUSICBRAINZ_CONTACT_EMAIL in .env.local");
  }
  return `SongGalaxy/0.1 (hackgt-meta-track; contact: ${contact})`;
}

export interface MusicBrainzResolution {
  title: string;
  artist: string;
  mbid: string;
  confidence: number; // 0..1
  releaseIds: string[]; // releases containing this recording, best guess first (for cover art)
}

let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

/** Waits for this caller's 1 req/sec slot. Chained, so concurrent callers queue instead of all reading the same lastRequestAt. */
function throttle(): Promise<void> {
  const slot = queue.then(async () => {
    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
    }
    lastRequestAt = Date.now();
  });
  queue = slot;
  return slot;
}

/**
 * Resolutions by typed title/artist, so re-saving a song (re-picks, "Add or change songs") skips the
 * throttled MusicBrainz call, and repeat lookups get the same recording id instead of MusicBrainz's
 * occasionally different one. In-memory only; a restart just re-asks. Failures aren't cached.
 */
const RESOLUTION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHED_RESOLUTIONS = 1000;
const resolutions = new Map<string, { at: number; resolution: MusicBrainzResolution | null }>();
const resolutionKey = (title: string, artist: string) => `${title.trim().toLowerCase()}::${artist.trim().toLowerCase()}`;

interface MusicBrainzRecording {
  id: string;
  title: string;
  score?: number;
  "artist-credit"?: { name: string }[];
  releases?: { id: string; status?: string }[];
}

interface MusicBrainzSearchResponse {
  recordings?: MusicBrainzRecording[];
}

/**
 * Resolves free-text title/artist into a canonical MusicBrainz recording.
 * Returns null if nothing confident enough was found — callers should fall
 * back to Gemini for identity/mood in that case (see CLAUDE.md).
 *
 * Rate-limited in-process to 1 req/sec per MusicBrainz's policy. Never call
 * this per keystroke — resolve on submit only.
 */
export async function resolveSong(title: string, artist: string): Promise<MusicBrainzResolution | null> {
  const key = resolutionKey(title, artist);
  const hit = resolutions.get(key);
  if (hit && Date.now() - hit.at < RESOLUTION_TTL_MS) return hit.resolution;

  const resolution = await searchRecording(title, artist);
  if (resolutions.size >= MAX_CACHED_RESOLUTIONS) resolutions.delete(resolutions.keys().next().value!);
  resolutions.set(key, { at: Date.now(), resolution });
  return resolution;
}

async function searchRecording(title: string, artist: string): Promise<MusicBrainzResolution | null> {
  await throttle();

  const query = `recording:"${title.replace(/"/g, '\\"')}" AND artist:"${artist.replace(/"/g, '\\"')}"`;
  const url = `${MUSICBRAINZ_BASE_URL}?query=${encodeURIComponent(query)}&fmt=json&limit=5`;

  const res = await fetch(url, {
    headers: { "User-Agent": buildUserAgent(), Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`MusicBrainz search failed: ${res.status}`);
  }

  const data = (await res.json()) as MusicBrainzSearchResponse;
  const best = (data.recordings ?? [])
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

  if (!best || !best.score) {
    return null;
  }

  const confidence = best.score / 100;
  if (confidence < CONFIDENCE_THRESHOLD) {
    return null;
  }

  const resolvedArtist = best["artist-credit"]?.[0]?.name ?? artist;

  return {
    title: best.title,
    artist: resolvedArtist,
    mbid: best.id,
    confidence,
    releaseIds: (best.releases ?? [])
      .slice()
      .sort((a, b) => Number(b.status === "Official") - Number(a.status === "Official"))
      .map((r) => r.id),
  };
}

/**
 * First front cover found in the Cover Art Archive for any of the given
 * releases, as a stable image URL, or null. The archive answers with a
 * redirect when art exists and 404 when it doesn't, so we probe without
 * following it. Not subject to MusicBrainz's 1 req/sec limit.
 */
export async function findCoverArtUrl(releaseIds: string[]): Promise<string | null> {
  for (const id of releaseIds.slice(0, 3)) {
    const url = `https://coverartarchive.org/release/${id}/front-250`;
    // Bounded so a slow archive can't hold up a pick save: each probe times out, and at most 3 tries (≤3s of backoff).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(4000) });
        if (res.status >= 300 && res.status < 400) return url;
        break; // a definite "no cover" answer; try the next release
      } catch (err) {
        console.error("Cover Art Archive lookup failed", id, err);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); // the archive drops connections under load; back off
      }
    }
  }
  return null;
}
