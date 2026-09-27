import type { Connection } from "./types";

export type ConnectionGroup = {
  cluster: string;
  label: string;
  color: string;
  people: Connection[];
};

const TIERS = [
  {
    key: "shared_songs",
    label: "You both picked the same song",
    color: "var(--foreground)",
    test: (c: Connection) => c.sharedSongs > 0,
  },
  {
    key: "shared_artists",
    label: "Same artists, different songs",
    color: "var(--muted-foreground)",
    test: (c: Connection) => c.sharedArtists > 0 && c.sharedSongs === 0,
  },
  {
    key: "why_thread",
    label: "Connected by why you listen",
    color: "var(--muted-foreground)",
    test: (_c: Connection) => true,
  },
] as const;

/**
 * Groups connections by concrete overlap and shared thread tiers.
 * Pure: no fetching, no mock imports.
 */
export function groupByWhy(
  connections: Connection[],
  sort: ConnectionSort = "match",
): ConnectionGroup[] {
  const remaining = [...connections];
  const groups: ConnectionGroup[] = [];

  for (const tier of TIERS) {
    const matches = remaining.filter(tier.test);
    for (const m of matches) {
      const idx = remaining.indexOf(m);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    if (matches.length > 0) {
      groups.push({
        cluster: tier.key,
        label:
          matches.length > 1 && tier.key === "shared_songs"
            ? "You both picked the same songs"
            : tier.label,
        color: tier.color,
        people: sortConnections(matches, sort),
      });
    }
  }

  return groups;
}

export type ConnectionSort = "match" | "shared" | "name";

export const SORT_LABELS: Record<ConnectionSort, string> = {
  match: "Best match",
  shared: "Most shared",
  name: "Name A–Z",
};

const sharedCount = (c: Connection) => c.sharedSongs * 1000 + c.sharedArtists;

const COMPARE: Record<
  ConnectionSort,
  (a: Connection, b: Connection) => number
> = {
  match: (a, b) => b.similarity - a.similarity,
  shared: (a, b) =>
    sharedCount(b) - sharedCount(a) || b.similarity - a.similarity,
  name: (a, b) => a.user.name.localeCompare(b.user.name),
};

/** Case-insensitive match on the person's name, their shared songs' titles and artists. */
export function filterConnections(
  connections: Connection[],
  query: string,
): Connection[] {
  const q = query.trim().toLowerCase();
  if (!q) return connections;
  return connections.filter(
    (c) =>
      c.user.name.toLowerCase().includes(q) ||
      c.evidenceSongs.some(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q),
      ),
  );
}

export function sortConnections(
  connections: Connection[],
  sort: ConnectionSort,
): Connection[] {
  return [...connections].sort(COMPARE[sort]);
}
