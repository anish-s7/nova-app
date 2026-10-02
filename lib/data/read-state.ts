"use client";

import { setSession, useSession } from "./session";
import type { Message } from "./types";
import { ME_ID } from "./api";

/**
 * Unread tracking for Messages. There's no "last read" column in the backend yet, so this lives
 * in the session (per browser tab, cleared on logout with everything else).
 */
export function markRead(userId: string, sentAt: string | undefined) {
  if (!sentAt) return;
  setSession((s) => {
    const prev = s.readAt?.[userId];
    return prev && prev >= sentAt ? {} : { readAt: { ...s.readAt, [userId]: sentAt } };
  });
}

/** Their newest message arrived after the last one you saw. Your own messages never count. */
export function useIsUnread() {
  const { readAt } = useSession();
  return (userId: string, last?: Message) => !!last && last.fromUserId !== ME_ID && last.sentAt > (readAt?.[userId] ?? "");
}
