import { EMOTION_WEIGHT } from "@/lib/music/emotion";
import { FEATURES, pairMatch, realFormulaMatch, type PairMatch, type SimUser } from "./model";

/**
 * The simulated matcher's in-run learning. Each run has a hidden rule for what makes a match
 * click, drawn fresh at random; the matcher starts with a naive equal weighting of four signals
 * (song content, mood, shared tags, same taste group) and adjusts from simulated outcomes.
 * Nothing is shared between runs. The signals are real (real embeddings, real tags, real
 * valence/energy geometry), but the outcomes and the hidden rule are invented, so this shows
 * the idea of tuning from outcomes and says nothing about how the production matcher would do.
 */

const LR = 0.08;
const WINDOW = 30;
const MAX_HISTORY = 160;
/** Chance a proposal is a random candidate instead of its top pick, so it also sees what it would otherwise never try. */
const EXPLORE = 0.25;
const PRIOR = FEATURES.map(() => 0.5);
/** Typical value of each feature for a random pair, used to keep the average click rate sensible. */
const TYPICAL = [0.15, 0.6, 0.12, 0.25];

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const dot = (w: number[], f: number[]) => w.reduce((s, x, i) => s + x * f[i], 0);

/** Weights of EMOTION_WEIGHT to try in the sweep; the production value is included so it shows up as a bar. */
const SWEEP = [0, 0.25, 0.5, 1, 2, EMOTION_WEIGHT, 8].filter((w, i, a) => a.indexOf(w) === i).sort((a, b) => a - b);
const SWEEP_EVERY = 12;
const SWEEP_SAMPLE = 16;

export type LearningPoint = { learned: number; fixed: number; ceiling: number };
export type LearningStats = {
  attempts: number;
  /** Rolling true match quality of the learning matcher's picks, a matcher frozen at the naive prior, and the best possible pick. */
  learned: number;
  fixed: number;
  ceiling: number;
  history: LearningPoint[];
  /** Learned weights and the hidden truth, each scaled so the largest is 1. */
  weights: number[];
  truth: number[];
  /** How many times more it has learned mood matters than song content; null until both are clearly positive. */
  moodPerContent: number | null;
  /** The production matcher's formula run in this world at different EMOTION_WEIGHTs: true match quality of its top picks. */
  sweep: { weight: number; quality: number }[];
  /** What the production code uses today. */
  productionWeight: number;
};

export type Attempt = { a: SimUser; b: SimUser; songA: number; songB: number; success: boolean };

export class Learner {
  private w = [...PRIOR];
  private bias = 0;
  private truth: number[];
  private truthBias: number;
  private recent: number[] = [];
  private recentFixed: number[] = [];
  private recentCeiling: number[] = [];
  private history: LearningPoint[] = [];
  private attempts = 0;
  private sweep: { weight: number; quality: number }[] = [];

  constructor(private rand: () => number) {
    // Each run decides what matters differently: a couple of signals dominate and the rest barely count,
    // and sometimes one of the dominant ones works against you (too much in common can be a turn-off).
    const n = FEATURES.length;
    const key = new Set<number>();
    while (key.size < 2) key.add(Math.floor(rand() * n));
    this.truth = Array.from({ length: n }, (_, i) => (key.has(i) ? (rand() < 0.7 ? 1 : -1) * (2.5 + rand() * 2.5) : -0.5 + rand() * 1.2));
    this.truthBias = -dot(this.truth, TYPICAL) - 1;
  }

  private truthP(f: number[]) {
    return sigmoid(dot(this.truth, f) + this.truthBias);
  }

  private best(ms: PairMatch[], score: (f: number[]) => number) {
    let bi = 0;
    let bs = -Infinity;
    ms.forEach((m, i) => {
      const s = score(m.f) + this.rand() * 1e-6;
      if (s > bs) [bi, bs] = [i, s];
    });
    return bi;
  }

  /** Propose a partner for `who`, see whether it clicks, learn from that. */
  attempt(who: SimUser, others: SimUser[]): Attempt | null {
    if (!others.length) return null;
    const ms = others.map((o) => pairMatch(who, o));
    const greedy = this.best(ms, (f) => dot(this.w, f));
    const pick = this.rand() < EXPLORE ? Math.floor(this.rand() * others.length) : greedy;
    const m = ms[pick];
    const p = this.truthP(m.f);
    const success = this.rand() < p;

    const g = (success ? 1 : 0) - sigmoid(dot(this.w, m.f) + this.bias);
    this.w = this.w.map((w, i) => w + LR * g * m.f[i]);
    this.bias += LR * g;

    // Reference lines, scored on the same attempt with the simulator's ground truth: what a matcher that
    // never learned would have picked, and the best pick anyone could have made. Quality is judged on
    // what the learner would pick when not exploring.
    this.push(this.recent, this.truthP(ms[greedy].f));
    this.push(this.recentFixed, this.truthP(ms[this.best(ms, (f) => dot(PRIOR, f))].f));
    this.push(this.recentCeiling, this.truthP(ms[this.best(ms, (f) => this.truthP(f))].f));
    this.attempts++;
    if (this.attempts % 3 === 0) this.history.push({ learned: mean(this.recent), fixed: mean(this.recentFixed), ceiling: mean(this.recentCeiling) });
    if (this.history.length > MAX_HISTORY) this.history.shift();
    if (this.attempts % SWEEP_EVERY === 0) this.runSweep(who, others);
    return { a: who, b: others[pick], songA: m.a, songB: m.b, success };
  }

  /** Try each EMOTION_WEIGHT on a handful of people and see how good the pick it would make really is. */
  private runSweep(who: SimUser, others: SimUser[]) {
    const pool = [who, ...others];
    const sample = Array.from({ length: Math.min(SWEEP_SAMPLE, pool.length) }, () => pool[Math.floor(this.rand() * pool.length)]);
    this.sweep = SWEEP.map((weight) => {
      let total = 0;
      for (const u of sample) {
        const cands = pool.filter((o) => o.id !== u.id);
        let bestP = 0;
        let bs = -Infinity;
        for (const o of cands) {
          const m = realFormulaMatch(u, o, weight);
          if (m.score! > bs) [bs, bestP] = [m.score!, this.truthP(m.f)];
        }
        total += bestP;
      }
      const now = total / sample.length;
      // Smooth across sweeps: one sample of 16 people is noisy, and the world changes slowly.
      const before = this.sweep.find((x) => x.weight === weight)?.quality;
      return { weight, quality: before === undefined ? now : before * 0.7 + now * 0.3 };
    });
  }

  private push(arr: number[], v: number) {
    arr.push(v);
    if (arr.length > WINDOW) arr.shift();
  }

  stats(): LearningStats {
    const scale = (v: number[]) => {
      const m = Math.max(...v.map(Math.abs), 1e-6);
      return v.map((x) => x / m);
    };
    const [content, mood] = this.w;
    return {
      attempts: this.attempts,
      learned: mean(this.recent),
      fixed: mean(this.recentFixed),
      ceiling: mean(this.recentCeiling),
      history: [...this.history],
      weights: scale(this.w),
      truth: scale(this.truth),
      sweep: this.sweep,
      productionWeight: EMOTION_WEIGHT,
      moodPerContent: content > 0.05 && mood > 0.05 && this.attempts > 30 ? mood / content : null,
    };
  }
}
