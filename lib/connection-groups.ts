import { getCluster } from "./clusters";
import type { Connection } from "./types";

export type ConnectionGroup = {
  cluster: string;
  label: string;
  color: string;
  people: Connection[];
};

/**
 * Groups connections under the "why" they share, strongest group first and strongest person
 * first inside each. Pure: no fetching, no mock imports.
 */
export function groupByWhy(
  connections: Connection[],
  sort: ConnectionSort = "match",
): ConnectionGroup[] {
  const byCluster = new Map<string, Connection[]>();
  for (const c of connections)
    byCluster.set(c.cluster, [...(byCluster.get(c.cluster) ?? []), c]);
  return [...byCluster.entries()]
    .map(([cluster, people]) => {
      const meta = getCluster(cluster);
      return {
        cluster,
        label: meta.label,
        color: meta.color,
        people: sortConnections(people, sort),
      };
    })
    .sort(
      (a, b) =>
        a.label.localeCompare(b.label) * (sort === "name" ? 1 : 0) ||
        Math.max(...b.people.map((c) => c.similarity)) -
          Math.max(...a.people.map((c) => c.similarity)),
    );
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
