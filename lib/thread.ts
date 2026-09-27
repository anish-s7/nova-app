import type { Message, Song } from "./types";

/**
 * A thread is what two people have passed back and forth: every Song Swap between them, in order.
 * Derived from messages, so it needs no storage of its own.
 */
/** From this many songs traded, the thread to someone glows in the galaxy. */
export const BOND_AT = 3;

/**
 * How bold a thread's line should look, 0 (barely there) .. 1 (fully lit) — continuous with
 * every swap, not a step at `BOND_AT`. Reaches half strength right at `BOND_AT` (so "bonded"
 * still lands on a meaningful point on the curve) and caps out at twice that many songs.
 */
export function threadBoldness(count: number): number {
  return Math.min(1, count / (BOND_AT * 2));
}

export type ThreadEntry = { swapId: string; song: Song; reason: string; fromMe: boolean; sentAt: string };

export type Thread = {
  entries: ThreadEntry[];
  /** "mine": their song is waiting on you. "theirs": yours is waiting on them. "even": every swap has been returned. "open": nothing yet. */
  turn: "mine" | "theirs" | "even" | "open";
  /** The most recent song in the thread. */
  last?: ThreadEntry;
};

export function threadFrom(messages: Message[], myId: string): Thread {
  const entries: ThreadEntry[] = messages
    .filter((m): m is Extract<Message, { kind: "swap" }> => m.kind === "swap")
    .map((m) => ({ swapId: m.swap.id, song: m.swap.song, reason: m.swap.reason, fromMe: m.fromUserId === myId, sentAt: m.sentAt }));
  const last = entries.at(-1);
  if (!last) return { entries, turn: "open" };
  const pending = messages.some((m) => m.kind === "swap" && m.swap.id === last.swapId && m.swap.status !== "returned");
  if (last.fromMe) return { entries, turn: pending ? "theirs" : "even", last };
  return { entries, turn: pending ? "mine" : "even", last };
}
