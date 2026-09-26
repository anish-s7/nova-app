import data from "./sim/song-vectors.json";
import { getCluster } from "./clusters";
import { getTheme, type ThemeId } from "./themes";
import type { SongLayer, SongStar } from "./song-layer";

/**
 * How songs connect to each other. Mock-only: real data would come from `song_picks` overlap and a
 * pgvector song-to-song query (see db/contract.md). Embeddings here are plain `{title, artist}` vectors,
 * so the Spotify rule holds.
 */
export type Reason =
  | { kind: "listeners"; names: string[]; count: number }
  | { kind: "theme"; themeId: ThemeId; label: string; color: string }
  | { kind: "why"; label: string; color: string }
  | { kind: "mood"; similarity: number };

export type ReasonKind = Reason["kind"];

export type SongConnection = { star: SongStar; score: number; reasons: Reason[] };

const W_LISTENER = 0.28;
const W_THEME = 0.3;
const W_WHY = 0.15;
const W_MOOD = 1.5;
/** Cosine similarity below this doesn't count as "similar mood". */
export const MOOD_MIN = 0.15;

const vectors = new Map<string, number[]>();
data.ids.forEach((id, i) => {
  const v = data.vectors[i] as number[];
  const norm = Math.hypot(...v) || 1;
  vectors.set(id, v.map((x) => x / norm));
});

/** Cosine similarity of two catalog songs' embeddings, or null when either has none. */
export function moodSimilarity(a: string, b: string): number | null {
  const va = vectors.get(a);
  const vb = vectors.get(b);
  if (!va || !vb) return null;
  let dot = 0;
  for (let i = 0; i < va.length; i++) dot += va[i]! * vb[i]!;
  return dot;
}

export function songConnections(star: SongStar, layer: SongLayer, limit = 8): SongConnection[] {
  const mineIds = new Map(star.listeners.map((l) => [l.id, l]));
  const out: SongConnection[] = [];
  for (const other of layer.stars) {
    if (other.id === star.id) continue;
    const reasons: Reason[] = [];
    let score = 0;

    const both = other.listeners.filter((l) => mineIds.has(l.id));
    if (both.length) {
      reasons.push({ kind: "listeners", names: both.map((l) => l.name), count: both.length });
      score += W_LISTENER * Math.min(both.length, 4);
    }
    for (const t of star.themes.filter((t) => other.themes.includes(t))) {
      const theme = getTheme(t);
      reasons.push({ kind: "theme", themeId: t, label: theme.label, color: theme.color });
      score += W_THEME;
    }
    if (other.cluster === star.cluster) {
      const c = getCluster(star.cluster);
      reasons.push({ kind: "why", label: c.short, color: c.color });
      score += W_WHY;
    }
    const sim = moodSimilarity(star.id, other.id);
    if (sim !== null && sim >= MOOD_MIN) {
      reasons.push({ kind: "mood", similarity: sim });
      score += W_MOOD * (sim - MOOD_MIN);
    }
    if (reasons.length) out.push({ star: other, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.star.song.title.localeCompare(b.star.song.title)).slice(0, limit);
}

/** One line for the strongest reason, in plain language. */
export function reasonLine(r: Reason): string {
  switch (r.kind) {
    case "listeners": {
      const [a, b] = r.names;
      return r.count === 1 ? `${a} has both` : r.count === 2 ? `${a} and ${b} have both` : `${a}, ${b} and ${r.count - 2} more have both`;
    }
    case "theme":
      return `Both: ${r.label}`;
    case "why":
      return `Both feel like ${r.label}`;
    case "mood":
      return "Similar mood";
  }
}

export const REASON_LABEL: Record<ReasonKind, string> = { listeners: "People", theme: "Moments", why: "Why", mood: "Mood" };
