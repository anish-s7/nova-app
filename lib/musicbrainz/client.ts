const MUSICBRAINZ_BASE_URL = "https://musicbrainz.org/ws/2/recording/";
const MIN_REQUEST_INTERVAL_MS = 1000; // MusicBrainz rate limit: 1 req/sec
const CONFIDENCE_THRESHOLD = 0.85; // below this, caller should fall back to Gemini

// TODO: replace with a real contact email before the demo — MusicBrainz
// requires a descriptive User-Agent with contact info and may block
// generic/missing ones.
const USER_AGENT = "SongGalaxy/0.1 (hackgt-meta-track; contact: set-real-email@example.com)";

export interface MusicBrainzResolution {
  title: string;
  artist: string;
  mbid: string;
  confidence: number; // 0..1
}

let lastRequestAt = 0;

async function throttle() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

interface MusicBrainzRecording {
  id: string;
  title: string;
  score?: number;
  "artist-credit"?: { name: string }[];
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
  await throttle();

  const query = `recording:"${title.replace(/"/g, '\\"')}" AND artist:"${artist.replace(/"/g, '\\"')}"`;
  const url = `${MUSICBRAINZ_BASE_URL}?query=${encodeURIComponent(query)}&fmt=json&limit=5`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
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
  };
}
