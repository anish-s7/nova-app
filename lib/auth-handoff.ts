"use client";

/**
 * Cross-tab handoff for email confirmation. Email links always open a new tab;
 * this lets that tab tell the tab still showing "Check your email" to carry on,
 * so the person ends up back where they started instead of in two tabs.
 * Both tabs share the session cookie, so the waiting tab is already signed in.
 */

const CHANNEL = "nova-auth";
type Message = { type: "confirmed" } | { type: "ack" };

const supported = () => typeof BroadcastChannel !== "undefined";

/** In the waiting tab: run `onConfirmed` when another tab finishes confirmation. */
export function listenForConfirmation(onConfirmed: () => void) {
  if (!supported()) return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e: MessageEvent<Message>) => {
    if (e.data?.type !== "confirmed") return;
    channel.postMessage({ type: "ack" } satisfies Message);
    onConfirmed();
  };
  return () => channel.close();
}

let announced: Promise<boolean> | null = null;

/**
 * In the confirmation tab: resolves true if a waiting tab picked up the handoff.
 * Announces once per page load. React dev mode runs effects twice, and a second
 * announcement can arrive after the waiting tab has already navigated away and
 * stopped listening, which would look like "no tab is waiting".
 */
export function announceConfirmation(timeoutMs = 1500): Promise<boolean> {
  if (!supported()) return Promise.resolve(false);
  announced ??= new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL);
    const done = (handedOff: boolean) => {
      clearTimeout(timer);
      channel.close();
      resolve(handedOff);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    channel.onmessage = (e: MessageEvent<Message>) => e.data?.type === "ack" && done(true);
    channel.postMessage({ type: "confirmed" } satisfies Message);
  });
  return announced;
}
