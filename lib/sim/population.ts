import { CLUSTER_IDS } from "@/lib/galaxy/clusters";
import { mulberry32 } from "./engine";
import type { SampleCandidate } from "@/lib/galaxy/galaxy-sample";

/** A synthetic population for the scale test. Not the live sim: no matching, no churn, just N people in tribes. */
export type Person = SampleCandidate & { name: string };

const K = CLUSTER_IDS.length;
const QUIRKS = 6;
const QUIRK_WEIGHT = 1.4;

/** Person 0 is "me". `mixing` is how blended everyone's taste is (0 = tight tribes). */
export function generatePopulation(n: number, seed: number, mixing = 0.4): Person[] {
  const rand = mulberry32(seed);
  const people: Person[] = [];
  for (let i = 0; i < n; i++) {
    const dominant = Math.floor(rand() * K);
    const taste = Array.from({ length: K }, (_, c) => (c === dominant ? (1 - mixing) * 3 : 0) + rand() * mixing * 1.2);
    const sum = taste.reduce((a, b) => a + b, 0);
    const quirk = Array.from({ length: QUIRKS }, () => rand() * QUIRK_WEIGHT);
    people.push({
      id: i === 0 ? "me" : `p${i}`,
      name: `Person ${i}`,
      cluster: CLUSTER_IDS[dominant],
      vector: [...taste.map((t) => t / sum), ...quirk],
      similarity: 0,
      // Most people are older; a steady trickle is new.
      joinedDaysAgo: Math.floor(-Math.log(rand() || 1e-9) * 40),
      // A few people share a strong thread despite being far away (the ambient far stars).
      bridge: rand() < 0.03 ? 0.4 + rand() * 0.6 : 0,
    });
  }
  return people;
}
