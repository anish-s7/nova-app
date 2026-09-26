import { createServerClient } from "../supabase/server";
import { TAGS } from "../tags";
import { DEFAULT_BUDGET, expandOrder, knnEdges, sampleGalaxy, type SampleCandidate } from "../galaxy-sample";
import { MIN_EMOTION_GAP } from "./findWander";
import { refreshPrimaryCluster } from "./refreshPrimaryCluster";

/**
 * The server side of the bounded galaxy (see db/contract.md "Galaxy window"). The front page never
 * gets everyone: it gets this window, plus counts for the rest.
 *
 * No Gemini here. Loading the galaxy must stay cheap and never spend LLM calls; the contrast
 * check only runs when someone taps Wander (lib/matching/findWander.ts).
 */

export interface WindowNode {
  profileId: string;
  displayName: string;
  cluster: string;
  /** Ambient far star: distant from you, but with a strong same-song thread. */
  far: boolean;
}

export interface WindowEdge {
  source: string;
  target: string;
  similarity: number;
}

export interface GalaxyWindow {
  meId: string;
  nodes: WindowNode[];
  edges: WindowEdge[];
  sampled: boolean;
  hidden: { total: number; byCluster: Record<string, number> };
}

export interface GalaxyMoreWindow {
  nodes: WindowNode[];
  edges: WindowEdge[];
  remaining: number;
}

type Loaded = SampleCandidate & { displayName: string };

/**
 * Small, diversity-only vector: which of the fixed tags the matched pick carries, plus where it sits
 * on the valence/energy circle. Used only to keep the near set from being 200 near-duplicates.
 * Similarity to you comes from the pgvector search, and nothing here is a profile-level average.
 */
function diversityVector(tags: string[], valence: number, energy: number) {
  return [...TAGS.map((t) => (tags.includes(t) ? 1 : 0)), valence * 1.5, energy * 1.5];
}

const day = () => Math.floor(Date.now() / 86_400_000);

async function loadCandidates(profileId: string): Promise<{ candidates: Loaded[]; counts: Record<string, number> }> {
  const supabase = createServerClient();

  // Profiles that predate primary_cluster get theirs here, so the viewer is never 'unassigned' in their own galaxy.
  await refreshPrimaryCluster(supabase, profileId).catch((err) => console.error("refreshPrimaryCluster failed on galaxy load:", err));

  const [pool, counts, far] = await Promise.all([
    supabase.rpc("galaxy_pool", { target_profile_id: profileId }),
    supabase.rpc("galaxy_cluster_counts", { target_profile_id: profileId }),
    // Ambient far stars come from Wander's retrieval (same song, far apart in feeling), without the LLM step.
    supabase.rpc("wander_picks", { target_profile_id: profileId, match_count: 6, min_emotion_gap: MIN_EMOTION_GAP }),
  ]);
  if (pool.error) throw new Error(`galaxy window failed: ${pool.error.message}`);
  if (counts.error) throw new Error(`galaxy window failed: ${counts.error.message}`);

  const byId = new Map<string, Loaded>();
  for (const r of pool.data ?? []) {
    byId.set(r.profile_id, {
      id: r.profile_id,
      displayName: r.display_name,
      cluster: r.cluster,
      similarity: Math.max(0, r.similarity),
      joinedDaysAgo: r.joined_days_ago,
      vector: diversityVector(r.tags, r.valence, r.energy),
    });
  }

  // Far candidates that the pool didn't already contain need their cluster and a vector.
  const farRows = (far.data ?? []).filter((f) => !byId.has(f.profile_id));
  if (farRows.length) {
    const [{ data: profiles }, { data: picks }] = await Promise.all([
      supabase.from("profiles").select("id, primary_cluster").in("id", farRows.map((f) => f.profile_id)),
      supabase.from("song_picks").select("id, tags, valence, energy").in("id", farRows.map((f) => f.song_pick_id)),
    ]);
    const clusterOf = new Map((profiles ?? []).map((p) => [p.id, p.primary_cluster ?? "unassigned"]));
    const pickOf = new Map((picks ?? []).map((p) => [p.id, p]));
    for (const f of farRows) {
      const pick = pickOf.get(f.song_pick_id);
      byId.set(f.profile_id, {
        id: f.profile_id,
        displayName: f.display_name,
        cluster: clusterOf.get(f.profile_id) ?? "unassigned",
        similarity: 0,
        joinedDaysAgo: 999,
        vector: diversityVector(pick?.tags ?? [], pick?.valence ?? 0, pick?.energy ?? 0),
      });
    }
  }
  for (const f of far.data ?? []) {
    const c = byId.get(f.profile_id);
    if (c) c.bridge = Math.min(1, f.emotion_gap / 2.83);
  }

  return {
    candidates: [...byId.values()],
    counts: Object.fromEntries((counts.data ?? []).map((c) => [c.cluster, Number(c.people)])),
  };
}

/** Counts of everyone not drawn: everyone per cluster, minus what's on screen. */
function hiddenAfter(counts: Record<string, number>, drawn: Loaded[]) {
  const byCluster = { ...counts };
  for (const c of drawn) byCluster[c.cluster] = Math.max(0, (byCluster[c.cluster] ?? 0) - 1);
  return { total: Object.values(byCluster).reduce((a, b) => a + b, 0), byCluster };
}

export async function getGalaxyWindow(profileId: string, limit = DEFAULT_BUDGET): Promise<GalaxyWindow> {
  const { candidates, counts } = await loadCandidates(profileId);
  const sample = sampleGalaxy(candidates, { budget: limit, seed: `${profileId}:${day()}` });
  const drawn = candidates.filter((c) => sample.ids.includes(c.id));
  const hidden = hiddenAfter(counts, drawn);

  // Edges: you to your strongest matches (real pgvector similarity), then a few among the drawn.
  const edges: WindowEdge[] = drawn
    .filter((c) => sample.slice.get(c.id) === "match")
    .map((c) => ({ source: profileId, target: c.id, similarity: c.similarity }));
  edges.push(...knnEdges(drawn, 3, 0.85));

  return {
    meId: profileId,
    nodes: drawn.map((c) => ({ profileId: c.id, displayName: c.displayName, cluster: c.cluster, far: sample.slice.get(c.id) === "far" })),
    edges,
    sampled: sample.sampled || hidden.total > 0,
    hidden,
  };
}

/** "More here": the next `step` people in `cluster`, after the `have` already revealed. Ranks at most the pool, not the whole cluster. */
export async function getGalaxyMoreWindow(profileId: string, cluster: string, have: number, step = 40, limit = DEFAULT_BUDGET): Promise<GalaxyMoreWindow> {
  const { candidates } = await loadCandidates(profileId);
  const sample = sampleGalaxy(candidates, { budget: limit, seed: `${profileId}:${day()}` });
  const order = expandOrder(candidates, new Set(sample.ids), cluster);
  const page = order.slice(have, have + step) as Loaded[];
  const drawn = candidates.filter((c) => sample.ids.includes(c.id));

  // Each new person threads to their two nearest people already on screen, so they fade in attached.
  const edges = knnEdges([...page, ...drawn], 2, 0.85).filter((e) => page.some((p) => p.id === e.source || p.id === e.target));
  return {
    nodes: page.map((c) => ({ profileId: c.id, displayName: c.displayName, cluster: c.cluster, far: false })),
    edges,
    remaining: Math.max(0, order.length - have - page.length),
  };
}
