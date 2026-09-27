import { cosineDistance } from "./cosineSimilarity";

/**
 * A from-scratch HDBSCAN (Campello/Moulavi/Sander) over arbitrary vectors, cosine distance.
 * Written in-house because the npm options don't fit: `hdbscan` is alpha-quality, and `hdbscanjs`
 * only builds the single-linkage tree — neither does the density-based condensing + stability
 * (excess-of-mass) cluster extraction that's the actual point of HDBSCAN over plain hierarchical
 * clustering (a fixed cut of a single-linkage tree can't produce a noise bucket the way this can).
 *
 * Scoped to the handful-of-hundreds of profiles this app expects: O(n^2) throughout (pairwise
 * distances, Prim's MST, per-node member arrays), not built for web-scale data.
 *
 * Terminology follows the original paper: unclustered points get label `-1` ("noise").
 */

export type HdbscanResult = {
  /** labels[i] is the 0-based cluster index for points[i], or -1 for noise. */
  labels: number[];
  /** centroids[k] is the mean vector of every point labeled k. */
  centroids: number[][];
};

type MergeNode = { left: number; right: number; dist: number; members: number[] };

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number) {
    this.parent[this.find(a)] = this.find(b);
  }
}

/** Prim's algorithm over the complete mutual-reachability graph. Returns the n-1 MST edges. */
function buildMst(n: number, mrd: (i: number, j: number) => number): { a: number; b: number; dist: number }[] {
  const inTree = new Array(n).fill(false);
  const bestDist = new Array(n).fill(Infinity);
  const bestFrom = new Array(n).fill(-1);
  const edges: { a: number; b: number; dist: number }[] = [];

  bestDist[0] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u === -1 || bestDist[i] < bestDist[u])) u = i;
    inTree[u] = true;
    if (bestFrom[u] !== -1) edges.push({ a: bestFrom[u], b: u, dist: bestDist[u] });
    for (let v = 0; v < n; v++) {
      if (inTree[v]) continue;
      const d = mrd(u, v);
      if (d < bestDist[v]) {
        bestDist[v] = d;
        bestFrom[v] = u;
      }
    }
  }
  return edges;
}

function memberSetOf(nodeId: number, n: number, nodes: MergeNode[]): number[] {
  return nodeId < n ? [nodeId] : nodes[nodeId - n].members;
}

/** lambda = 1/distance, the "how dense" axis HDBSCAN's stability is computed in. Capped for dist=0 (exact duplicates). */
function lambdaOf(dist: number): number {
  return dist > 0 ? 1 / dist : 1e12;
}

type CondensedCluster = {
  id: number;
  children: number[];
  birthDist: number;
  /** point index -> the distance/way it left this cluster (all of a cluster's members eventually exit one way or the other). */
  exit: Map<number, number>;
};

/**
 * HDBSCAN over `points`. `minClusterSize` is both the density parameter (core distance = distance
 * to the minClusterSize-th nearest neighbor) and the smallest group that counts as a real cluster.
 */
export function hdbscan(points: number[][], minClusterSize: number): HdbscanResult {
  const n = points.length;
  if (n === 0) return { labels: [], centroids: [] };
  if (minClusterSize < 2) throw new Error("hdbscan: minClusterSize must be at least 2");
  if (n < minClusterSize) return { labels: points.map(() => -1), centroids: [] };

  // Pairwise distances and core distances (distance to each point's minClusterSize-th neighbor).
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = cosineDistance(points[i], points[j]);
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }
  const core = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const sorted = dist[i].filter((_, j) => j !== i).sort((a, b) => a - b);
    core[i] = sorted[minClusterSize - 1] ?? sorted[sorted.length - 1] ?? 0;
  }
  const mrd = (i: number, j: number) => Math.max(core[i], core[j], dist[i][j]);

  // Single-linkage tree from the MST: leaves 0..n-1, internal (merge) nodes n..2n-2.
  const mstEdges = buildMst(n, mrd).sort((e1, e2) => e1.dist - e2.dist);
  const uf = new UnionFind(n);
  const nodeIdOfRoot = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) nodeIdOfRoot[i] = i;
  const nodes: MergeNode[] = [];
  for (const { a, b, dist: d } of mstEdges) {
    const nodeIdA = nodeIdOfRoot[uf.find(a)];
    const nodeIdB = nodeIdOfRoot[uf.find(b)];
    const members = [...memberSetOf(nodeIdA, n, nodes), ...memberSetOf(nodeIdB, n, nodes)];
    const newId = n + nodes.length;
    nodes.push({ left: nodeIdA, right: nodeIdB, dist: d, members });
    uf.union(a, b);
    nodeIdOfRoot[uf.find(a)] = newId;
  }
  const rootNodeId = n + nodes.length - 1;
  if (memberSetOf(rootNodeId, n, nodes).length < minClusterSize) return { labels: points.map(() => -1), centroids: [] };

  // Condense top-down: a "true split" (both sides >= minClusterSize) ends the current cluster and
  // starts two new ones; a "small split" peels the small side off as noise and the same cluster
  // continues into the big side; if both sides are too small, the whole thing dissolves to noise.
  let nextClusterId = 0;
  const clusters = new Map<number, CondensedCluster>();
  // Root-to-leaf chain of every cluster each point was ever a member of (root first). Recorded at
  // a cluster's creation, when its initial member set is known — not at its exit, since a cluster
  // that dissolves straight to noise without ever splitting further would otherwise never appear
  // in any point's lineage at all, even though it may well be the selected cluster for its members.
  const pointLineage: number[][] = Array.from({ length: n }, () => []);

  function newCluster(birthDist: number, members: number[]): CondensedCluster {
    const c: CondensedCluster = { id: nextClusterId++, children: [], birthDist, exit: new Map() };
    clusters.set(c.id, c);
    for (const p of members) pointLineage[p].push(c.id);
    return c;
  }

  function markExit(cluster: CondensedCluster, pts: number[], d: number) {
    for (const p of pts) {
      if (!cluster.exit.has(p)) cluster.exit.set(p, d);
    }
  }

  function condense(nodeId: number, cluster: CondensedCluster) {
    if (nodeId < n) {
      // Only reachable if minClusterSize were 1 (disallowed above); kept as a safe terminal case.
      markExit(cluster, [nodeId], 0);
      return;
    }
    const node = nodes[nodeId - n];
    const leftMembers = memberSetOf(node.left, n, nodes);
    const rightMembers = memberSetOf(node.right, n, nodes);
    const leftBig = leftMembers.length >= minClusterSize;
    const rightBig = rightMembers.length >= minClusterSize;

    if (leftBig && rightBig) {
      markExit(cluster, [...leftMembers, ...rightMembers], node.dist);
      const cLeft = newCluster(node.dist, leftMembers);
      const cRight = newCluster(node.dist, rightMembers);
      cluster.children.push(cLeft.id, cRight.id);
      condense(node.left, cLeft);
      condense(node.right, cRight);
    } else if (leftBig) {
      markExit(cluster, rightMembers, node.dist);
      condense(node.left, cluster);
    } else if (rightBig) {
      markExit(cluster, leftMembers, node.dist);
      condense(node.right, cluster);
    } else {
      markExit(cluster, [...leftMembers, ...rightMembers], node.dist);
    }
  }

  const root = newCluster(Infinity, memberSetOf(rootNodeId, n, nodes));
  condense(rootNodeId, root);

  // Stability: how much "density-persistence" (in lambda = 1/distance) a cluster's members
  // accumulate between the cluster's birth and each member's eventual exit.
  function stability(c: CondensedCluster): number {
    const birthLambda = c.birthDist === Infinity ? 0 : lambdaOf(c.birthDist);
    let s = 0;
    for (const d of c.exit.values()) s += lambdaOf(d) - birthLambda;
    return s;
  }

  // Excess-of-mass selection, bottom-up: keep a cluster over its children whenever its own
  // stability beats their combined stability.
  function eom(clusterId: number): { total: number; selected: number[] } {
    const c = clusters.get(clusterId)!;
    if (c.children.length === 0) return { total: stability(c), selected: [c.id] };
    const childResults = c.children.map(eom);
    const childTotal = childResults.reduce((sum, r) => sum + r.total, 0);
    const own = stability(c);
    if (own >= childTotal) return { total: own, selected: [c.id] };
    return { total: childTotal, selected: childResults.flatMap((r) => r.selected) };
  }
  const selected = new Set(eom(root.id).selected);

  // Label each point with the deepest selected cluster in its lineage, else noise (-1). A point
  // that fell out as noise at some cluster never reaches a deeper one, so this can't "skip past"
  // where it actually stopped belonging.
  const rawLabel = new Array(n).fill(-1);
  for (let p = 0; p < n; p++) {
    const lineage = pointLineage[p];
    for (let i = lineage.length - 1; i >= 0; i--) {
      if (selected.has(lineage[i])) {
        rawLabel[p] = lineage[i];
        break;
      }
    }
  }

  // Compact to 0..k-1 in a stable order, and compute centroids.
  const orderedClusterIds = [...selected].sort((a, b) => a - b);
  const indexOf = new Map(orderedClusterIds.map((id, i) => [id, i]));
  const labels = rawLabel.map((id: number) => (id === -1 ? -1 : indexOf.get(id)!));
  const dim = points[0].length;
  const centroids = orderedClusterIds.map((id) => {
    const members = points.filter((_, p) => labels[p] === indexOf.get(id));
    const sum = new Array(dim).fill(0);
    for (const v of members) for (let i = 0; i < dim; i++) sum[i] += v[i];
    return sum.map((x) => x / members.length);
  });

  return { labels, centroids };
}
