import { forceLink, forceManyBody, forceSimulation, forceX, forceY, forceZ, type SimNode } from "d3-force-3d";
import { CLUSTER_IDS, CLUSTERS } from "@/lib/galaxy/clusters";
import type { Layout } from "@/lib/galaxy/galaxy-layout";
import type { GalaxyEdge, GalaxyNode } from "@/lib/data/types";
import { Learner, type LearningStats } from "./learner";
import { SONGS, defaultSim, dominant, makePick, pairMatch, randomSong, songLabel, type SimUser } from "./model";

/**
 * Client-side live simulation. Every run is grown from a fresh random seed: nothing carries
 * over between runs, and nothing here touches Supabase or calls Gemini at runtime. The people
 * are synthetic; the songs are the mock catalog with real, pre-computed Gemini embeddings
 * (lib/sim/song-vectors.json), and matching is per pick, like the real matcher.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => (Math.random() * 2 ** 32) >>> 0;

const K = CLUSTER_IDS.length;
const NEIGHBORS = 3;
const EDGE_MIN = 0.42;
export const MAX_USERS = 240;
const MIN_USERS = 10;
const FRAME_RADIUS = 20;
/** Background match attempts per simulated second, on top of one per arrival. */
const ATTEMPT_RATE = 1.5;
/** A person who leaves fades out over this many steps, whatever the playback speed. */
const FADE_STEPS = 6;
const MAX_PICKS = 8;

export type { LearningStats, SimUser };

export type Scenario = {
  id: string;
  name: string;
  blurb: string;
  /** Tastes present at the start, as weights over CLUSTER_IDS. */
  tasteWeights: number[];
  /** 0 = tight tribes, 1 = everyone is a blend. */
  mixing: number;
  startUsers: number;
  /** Arrivals per second. */
  joinRate: number;
  /** Fraction of the population that leaves per second. */
  churn: number;
  /** Scripted shocks: [seconds in, event]. */
  script: [number, SimEvent][];
};

export type SimEvent = "viral_song" | "new_community" | "bridge_user" | "join_wave" | "exodus";

export const EVENT_LABELS: Record<SimEvent, string> = {
  viral_song: "Viral song",
  new_community: "New community",
  bridge_user: "Bridge user",
  join_wave: "Join wave",
  exodus: "Exodus",
};

export type SimStats = { users: number; joined: number; left: number; matches: number; communities: number };
export type FeedItem = { id: number; at: number; text: string; kind: "join" | "leave" | "match" | "event" };

export type Snapshot = {
  seed: number;
  scenario: Scenario;
  clock: number;
  /** Includes people who are mid-fade after leaving; `fading` says how far along (0..1). */
  nodes: GalaxyNode[];
  edges: GalaxyEdge[];
  layout: Layout;
  fading: Map<string, number>;
  stats: SimStats;
  learning: LearningStats;
  feed: FeedItem[];
  users: Map<string, SimUser>;
};

const FIRST = ["Ava", "Noor", "Leo", "Mika", "Sam", "Iris", "Theo", "Zara", "Jonas", "Lena", "Kai", "Maya", "Omar", "Tess", "Ravi", "Nina", "Eli", "Suki", "Dara", "Finn", "Ines", "Juno", "Luca", "Wren", "Yara", "Cal", "Pia", "Remy", "Odie", "Bea"];

export const PRESETS: Scenario[] = [
  {
    id: "slow_burn",
    name: "Slow burn",
    blurb: "A quiet start. Small groups find each other and tighten.",
    tasteWeights: [1, 1, 1, 0.6, 0.6],
    mixing: 0.45,
    startUsers: 14,
    joinRate: 1.1,
    churn: 0.006,
    script: [],
  },
  {
    id: "viral_moment",
    name: "Viral moment",
    blurb: "One song spreads and a whole community swells around it.",
    tasteWeights: [0.6, 1.2, 0.6, 0.6, 0.6],
    mixing: 0.4,
    startUsers: 20,
    joinRate: 1.3,
    churn: 0.008,
    script: [[18, "viral_song"], [40, "join_wave"]],
  },
  {
    id: "two_worlds",
    name: "Two worlds collide",
    blurb: "Two separate scenes grow apart, until someone bridges them.",
    tasteWeights: [1.6, 0, 0, 1.6, 0],
    mixing: 0.3,
    startUsers: 22,
    joinRate: 1.2,
    churn: 0.007,
    script: [[26, "bridge_user"], [34, "bridge_user"], [50, "new_community"]],
  },
];

/** A scenario nobody wrote: random population, blending and churn, with a couple of random shocks. */
export function randomScenario(rand: () => number): Scenario {
  const tasteWeights: number[] = Array.from({ length: K }, () => (rand() < 0.3 ? 0 : 0.3 + rand() * 1.5));
  if (!tasteWeights.some((w) => w > 0)) tasteWeights[Math.floor(rand() * K)] = 1;
  const pool: SimEvent[] = ["viral_song", "new_community", "bridge_user", "join_wave", "exodus"];
  const script: [number, SimEvent][] = Array.from({ length: 2 + Math.floor(rand() * 3) }, (): [number, SimEvent] => [12 + rand() * 60, pool[Math.floor(rand() * pool.length)]]);
  return {
    id: "random",
    name: "Randomized",
    blurb: "A population nobody designed. No two runs match.",
    tasteWeights,
    mixing: 0.15 + rand() * 0.7,
    startUsers: 10 + Math.floor(rand() * 20),
    joinRate: 0.7 + rand() * 1.4,
    churn: 0.003 + rand() * 0.012,
    script: script.sort((a, b) => a[0] - b[0]),
  };
}

const norm = (v: number[]) => {
  const s = v.reduce((a, b) => a + b, 0) || 1;
  return v.map((x) => x / s);
};

type P = SimNode & { cluster: string };
type L = { source: string | P; target: string | P; similarity: number };
type Leaver = { node: GalaxyNode; x: number; y: number; z: number; left: number };

export class Simulation {
  readonly seed: number;
  scenario: Scenario;
  clock = 0;
  private rand: () => number;
  private users = new Map<string, SimUser>();
  private pos = new Map<string, P>();
  private leavers = new Map<string, Leaver>();
  private edges: GalaxyEdge[] = [];
  private feed: FeedItem[] = [];
  private feedId = 0;
  private uid = 0;
  private joined = 0;
  private left = 0;
  private matches = 0;
  private learner: Learner;
  private attemptDebt = 0;
  private joinDebt = 0;
  private leaveDebt = 0;
  private script: [number, SimEvent][];
  private dirty = true;
  private scale: number | null = null;
  private sim: ReturnType<typeof forceSimulation<P>> | null = null;
  /** Tastes currently "live" for new arrivals. Grows with new_community. */
  private weights: number[];

  constructor(scenario: Scenario, seed = newSeed()) {
    this.seed = seed;
    this.scenario = scenario;
    this.rand = mulberry32(seed);
    this.weights = [...scenario.tasteWeights];
    this.learner = new Learner(mulberry32(seed ^ 0x9e3779b9));
    this.script = [...scenario.script];
    for (let i = 0; i < scenario.startUsers; i++) this.addUser(undefined, true);
    this.settle(220);
  }

  private pick(weights: number[]) {
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let r = this.rand() * total;
    for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) <= 0) return i;
    return weights.length - 1;
  }

  private makeUser(dom: number, second?: number, firstSong?: number): SimUser {
    const m = this.scenario.mixing;
    const taste = Array.from({ length: K }, (_, i) => (i === dom ? (1 - m) * 3 : 0) + this.rand() * m * 1.2 * (this.weights[i] > 0 ? 1 : 0.15));
    if (second !== undefined) taste[second] += taste[dom];
    const t = norm(taste);
    const picks = Array.from({ length: 3 + Math.floor(this.rand() * 4) }, () => makePick(this.rand, t));
    if (firstSong !== undefined) picks[0] = makePick(this.rand, t, firstSong);
    const name = `${FIRST[Math.floor(this.rand() * FIRST.length)]} ${String.fromCharCode(65 + Math.floor(this.rand() * 26))}.`;
    return { id: `sim-${this.uid++}`, name, taste: t, picks, bornAt: this.clock };
  }

  private log(kind: FeedItem["kind"], text: string) {
    this.feed.unshift({ id: this.feedId++, at: this.clock, text, kind });
    if (this.feed.length > 30) this.feed.pop();
  }

  private nearest(u: SimUser) {
    let best: SimUser | undefined;
    let bs = -1;
    for (const o of this.users.values()) {
      if (o.id === u.id) continue;
      const s = defaultSim(pairMatch(u, o).f);
      if (s > bs) [best, bs] = [o, s];
    }
    return best;
  }

  private addUser(user?: SimUser, silent = false) {
    const u = user ?? this.makeUser(this.pick(this.weights));
    const near = this.pos.get(this.nearest(u)?.id ?? "");
    this.users.set(u.id, u);
    this.pos.set(u.id, {
      id: u.id,
      cluster: CLUSTER_IDS[dominant(u)],
      x: (near?.x ?? 0) + (this.rand() - 0.5) * 6,
      y: (near?.y ?? 0) + (this.rand() - 0.5) * 6,
      z: (near?.z ?? 0) + (this.rand() - 0.5) * 6,
    });
    this.dirty = true;
    if (silent) return u;
    this.joined++;
    this.log("join", `${u.name} joined`);
    this.attempt(u, true);
    return u;
  }

  /** One match attempt for `who`: the matcher proposes a partner, the world decides whether it clicks. */
  private attempt(who: SimUser, announce: boolean) {
    const r = this.learner.attempt(who, [...this.users.values()].filter((o) => o.id !== who.id));
    if (!r) return;
    if (r.success) this.matches++;
    if (announce && r.success) {
      const songs = r.songA === r.songB ? `over ${songLabel(r.songA)}` : `${songLabel(r.songA)} and ${songLabel(r.songB)}`;
      this.log("match", `${r.a.name} and ${r.b.name} clicked: ${songs}`);
    }
  }

  private removeUser(id: string) {
    const u = this.users.get(id);
    const p = this.pos.get(id);
    if (!u || !p) return;
    this.leavers.set(id, { node: { userId: id, name: u.name, cluster: p.cluster, topMotivations: [], isMe: false }, x: p.x!, y: p.y!, z: p.z!, left: FADE_STEPS });
    this.users.delete(id);
    this.pos.delete(id);
    this.left++;
    this.dirty = true;
    this.log("leave", `${u.name} left`);
  }

  private randomUserId() {
    const ids = [...this.users.keys()];
    return ids[Math.floor(this.rand() * ids.length)];
  }

  /** Interactive and scripted shocks share this one entry point. */
  trigger(event: SimEvent): void {
    const live = CLUSTER_IDS.map((_, i) => i).filter((i) => this.weights[i] > 0);
    switch (event) {
      case "viral_song": {
        const d = live[Math.floor(this.rand() * live.length)];
        const song = randomSong(this.rand, d);
        this.weights[d] = (this.weights[d] || 0.5) * 3;
        // A real song from the catalog spreads: a share of existing people add it, and newcomers arrive with it.
        for (const u of this.users.values()) if (this.rand() < 0.35 && u.picks.length < MAX_PICKS) u.picks.push(makePick(this.rand, u.taste, song));
        for (let i = 0; i < 8; i++) this.addUser(this.makeUser(d, undefined, song));
        this.dirty = true;
        this.log("event", `${songLabel(song)} by ${SONGS[song].artist} went viral`);
        break;
      }
      case "new_community": {
        const off = CLUSTER_IDS.map((_, i) => i).filter((i) => this.weights[i] === 0);
        const d = off.length ? off[Math.floor(this.rand() * off.length)] : live[Math.floor(this.rand() * live.length)];
        this.weights[d] = 1.4;
        for (let i = 0; i < 9; i++) this.addUser(this.makeUser(d));
        this.log("event", `A new community formed: "${CLUSTERS[CLUSTER_IDS[d]].short}"`);
        break;
      }
      case "bridge_user": {
        if (live.length < 2) return void this.trigger("new_community");
        const a = live[Math.floor(this.rand() * live.length)];
        const b = live.filter((i) => i !== a)[Math.floor(this.rand() * (live.length - 1))];
        const u = this.addUser(this.makeUser(a, b));
        this.log("event", `${u.name} bridges "${CLUSTERS[CLUSTER_IDS[a]].short}" and "${CLUSTERS[CLUSTER_IDS[b]].short}"`);
        break;
      }
      case "join_wave": {
        for (let i = 0; i < 14; i++) this.addUser();
        this.log("event", "A wave of new listeners arrived");
        break;
      }
      case "exodus": {
        const n = Math.floor(this.users.size * 0.3);
        for (let i = 0; i < n && this.users.size > MIN_USERS; i++) this.removeUser(this.randomUserId());
        this.log("event", "Many listeners left at once");
        break;
      }
    }
  }

  /** Advance the world by `dt` seconds, then relax the layout a little. */
  step(dt: number) {
    this.clock += dt;
    for (const [id, l] of this.leavers) if (--l.left < 0) this.leavers.delete(id);
    while (this.script.length && this.script[0][0] <= this.clock) this.trigger(this.script.shift()![1]);

    // Growth: arrivals outpace departures, so the world swells with some churn.
    const pressure = 1 - this.users.size / MAX_USERS;
    this.joinDebt += this.scenario.joinRate * Math.max(0, pressure) * dt;
    this.leaveDebt += this.scenario.churn * this.users.size * dt;
    while (this.joinDebt >= 1 && this.users.size < MAX_USERS) {
      this.joinDebt -= 1;
      this.addUser();
    }
    while (this.leaveDebt >= 1) {
      this.leaveDebt -= 1;
      if (this.users.size > MIN_USERS) this.removeUser(this.randomUserId());
    }
    this.attemptDebt += ATTEMPT_RATE * dt;
    while (this.attemptDebt >= 1 && this.users.size > 1) {
      this.attemptDebt -= 1;
      this.attempt(this.users.get(this.randomUserId())!, false);
    }
    this.settle(4);
  }

  private rebuild() {
    const us = [...this.users.values()];
    const links = new Map<string, GalaxyEdge>();
    for (const a of us) {
      const scored: [SimUser, number][] = [];
      for (const b of us) if (a.id !== b.id) scored.push([b, defaultSim(pairMatch(a, b).f)]);
      scored.sort((x, y) => y[1] - x[1]);
      for (const [b, s] of scored.slice(0, NEIGHBORS)) {
        if (s < EDGE_MIN) continue;
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (!links.has(key)) links.set(key, { source: a.id, target: b.id, similarity: s, sharedMotivation: "", sharedSongs: 0, sharedArtists: 0 });
      }
    }
    this.edges = [...links.values()];
    const nodes = [...this.pos.values()];
    const l: L[] = this.edges.map((e) => ({ source: e.source, target: e.target, similarity: e.similarity }));
    this.sim = forceSimulation<P>(nodes, 3)
      .force(
        "link",
        forceLink<P, L>(l)
          .id((d) => d.id)
          .distance((x) => 1.5 + (1 - x.similarity) * 14)
          .strength((x) => 0.25 + x.similarity * x.similarity * 0.7),
      )
      .force("charge", forceManyBody<P>().strength(-9).distanceMax(30))
      // No taste anchors: clusters here are whatever the links pull together. Gravity only keeps the whole from drifting off.
      .force("x", forceX<P>(0).strength(0.015))
      .force("y", forceY<P>(0).strength(0.015))
      .force("z", forceZ<P>(0).strength(0.015))
      .stop();
    this.dirty = false;
  }

  private settle(ticks: number) {
    if (this.dirty || !this.sim) this.rebuild();
    this.sim!.alpha(0.5).tick(ticks);
  }

  snapshot(): Snapshot {
    const nodes: GalaxyNode[] = [];
    const raw: { id: string; cluster: string; x: number; y: number; z: number }[] = [];
    let radius = 1;
    for (const u of this.users.values()) {
      const p = this.pos.get(u.id)!;
      const cluster = CLUSTER_IDS[dominant(u)];
      p.cluster = cluster;
      nodes.push({ userId: u.id, name: u.name, cluster, topMotivations: [], isMe: false });
      raw.push({ id: u.id, cluster, x: p.x!, y: p.y!, z: p.z! });
      radius = Math.max(radius, Math.hypot(p.x!, p.y!, p.z!));
    }
    const people = nodes.length;
    const fading = new Map<string, number>();
    for (const [id, l] of this.leavers) {
      nodes.push(l.node);
      raw.push({ id, cluster: l.node.cluster, x: l.x, y: l.y, z: l.z });
      fading.set(id, 1 - l.left / FADE_STEPS);
    }
    // The scene frames its camera once, at mount, so hold the whole at a constant size: scale up while the
    // world is small and down as it grows, easing so the change reads as the galaxy settling, not jumping.
    const target = FRAME_RADIUS / radius;
    this.scale = this.scale === null ? target : this.scale + (target - this.scale) * 0.2;
    const k = this.scale;
    const points = new Map(raw.map((r) => [r.id, { ...r, x: r.x * k, y: r.y * k, z: r.z * k }]));

    const sizes = new Map<string, number>();
    for (const n of nodes.slice(0, people)) sizes.set(n.cluster, (sizes.get(n.cluster) ?? 0) + 1);
    return {
      seed: this.seed,
      scenario: this.scenario,
      clock: this.clock,
      nodes,
      edges: this.edges.filter((e) => this.users.has(e.source as string) && this.users.has(e.target as string)),
      layout: { points, radius: radius * k },
      fading,
      stats: { users: people, joined: this.joined, left: this.left, matches: this.matches, communities: [...sizes.values()].filter((n) => n >= 4).length },
      learning: this.learner.stats(),
      feed: [...this.feed],
      users: new Map(this.users),
    };
  }
}
