"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowUp, ChevronLeft, ChevronRight, Disc3, Sparkles } from "lucide-react";
import { SongSwapCard } from "@/components/chat/song-swap-card";
import { ThemeTag } from "@/components/onboarding/theme-tag";
import { ThreadStrip } from "@/components/connections/thread-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/profile/user-avatar";
import { getConversation, ME_ID, sendMessage } from "@/lib/data/api";
import { markRead } from "@/lib/data/read-state";
import { threadFrom } from "@/lib/thread";
import { clockTime, dayLabel, sameDay } from "@/lib/time";
import type { Conversation, Message } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const PENDING = "pending-";
/** Messages from the same person this close together read as one group. */
const GROUP_GAP_MS = 5 * 60_000;
/** A quiet spell this long gets a centered time stamp, as in iMessage. */
const STAMP_GAP_MS = 60 * 60_000;

type Group = { from: string; day: string; messages: Message[] };

/** Splits the conversation into runs by the same sender, broken by day changes, gaps, and Song Swaps. */
function groupMessages(messages: Message[]): Group[] {
  const groups: Group[] = [];
  for (const m of messages) {
    const g = groups.at(-1);
    const prev = g?.messages.at(-1);
    const joins =
      g && prev && prev.fromUserId === m.fromUserId && prev.kind === "text" && m.kind === "text" && sameDay(prev.sentAt, m.sentAt) && new Date(m.sentAt).getTime() - new Date(prev.sentAt).getTime() < GROUP_GAP_MS;
    if (joins) g.messages.push(m);
    else groups.push({ from: m.fromUserId, day: m.sentAt, messages: [m] });
  }
  return groups;
}

export function ChatView({ userId, initialDraft }: { userId: string; initialDraft: string }) {
  const { data, error, mutate } = useSWR(["conversation", userId], ([, id]) => getConversation(id), { refreshInterval: 2000 });
  const [draft, setDraft] = useState(initialDraft);
  const [sendError, setSendError] = useState("");
  const scroller = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const didInitialScroll = useRef(false);
  const count = data?.messages.length ?? 0;
  const lastSentAt = data?.messages.at(-1)?.sentAt;

  // Land at the newest message instantly; after that, glide to anything new.
  useLayoutEffect(() => {
    if (!count) return;
    endRef.current?.scrollIntoView({ block: "end", behavior: didInitialScroll.current ? "smooth" : "instant" });
    didInitialScroll.current = true;
  }, [count]);

  // Opening the chat (and anything arriving while it's open) counts as read.
  useEffect(() => markRead(userId, lastSentAt), [userId, lastSentAt]);

  async function send() {
    const text = draft.trim();
    if (!text || !data) return;
    setDraft("");
    setSendError("");
    const optimistic: Message = { id: `${PENDING}${Date.now()}`, fromUserId: ME_ID, sentAt: new Date().toISOString(), kind: "text", text };
    try {
      // Show it right away; the real message replaces it when the refetch lands.
      await mutate(
        async () => {
          await sendMessage(userId, text);
          return undefined;
        },
        { optimisticData: (cur?: Conversation) => (cur ? { ...cur, messages: [...cur.messages, optimistic] } : cur!), rollbackOnError: true, populateCache: false, revalidate: true },
      );
    } catch {
      setDraft(text);
      setSendError("That didn't send. It's still here, waiting — try again.");
    }
  }

  const thread = data ? threadFrom(data.messages, ME_ID) : undefined;
  const pendingSwapId = thread?.turn === "mine" ? thread.last?.swapId : undefined;
  const jumpToPending = () => {
    const el = document.getElementById(`swap-${pendingSwapId}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.animate([{ boxShadow: "0 0 0 2px var(--primary)" }, { boxShadow: "0 0 0 2px transparent" }], { duration: 1600, delay: 350, easing: "ease-out" });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col font-chat">
      {/* iMessage-style header: back on the left (phones only; laptops have the list beside it),
          the person centered, their Connection Card on the right. */}
      <header className="grid min-h-16 grid-cols-[44px_1fr_44px] items-center gap-2 border-b border-white/[0.07] bg-background/80 px-3 pb-2 pt-3 backdrop-blur-xl lg:px-6">
        <Link href="/messages" aria-label="Back to messages" className="inline-flex size-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-white/5 lg:invisible">
          <ChevronLeft className="size-7" strokeWidth={1.8} aria-hidden />
        </Link>
        {data ? (
          <Link href={`/people/${userId}`} className="mx-auto flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-0.5 hover:opacity-85">
            <UserAvatar name={data.user.name} cluster={data.cluster} userId={data.user.id} size={40} />
            <span className="flex max-w-full items-center gap-0.5 text-[13px] font-medium leading-none">
              <span className="truncate">{data.user.name}</span>
              <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            </span>
          </Link>
        ) : (
          <span className="mx-auto flex flex-col items-center gap-1" aria-busy="true">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </span>
        )}
        <Link href={`/people/${userId}/card`} aria-label="View Connection Card" className="inline-flex size-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-white/5">
          <Sparkles className="size-5" aria-hidden />
        </Link>
      </header>

      {data && thread ? <ThreadStrip thread={thread} name={data.user.name} userId={userId} onJumpToPending={pendingSwapId ? jumpToPending : undefined} /> : null}

      <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto bg-background px-4 pb-4 lg:px-8">
        {error ? (
          <p className="py-16 text-center text-muted-foreground">{error.message}</p>
        ) : !data ? (
          <div className="flex flex-col gap-3 pt-4" aria-busy="true">
            <Skeleton className="h-10 w-2/3 rounded-[18px]" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-[18px]" />
          </div>
        ) : data.messages.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center pb-2 pt-10 text-center">
            <UserAvatar name={data.user.name} cluster={data.cluster} userId={data.user.id} size={72} ring />
            <p className="mt-3 text-lg font-semibold">{data.user.name}</p>
            {data.sharedMotivation ? (
              <>
                <p className="mt-3 text-sm text-muted-foreground">You both listen for</p>
                <ThemeTag label={data.sharedMotivation} size="sm" className="mt-1.5" />
              </>
            ) : null}
            {data.suggestedOpeners.length ? (
              <div className="mt-8 flex w-full flex-col items-end gap-2">
                <p className="w-full text-center text-[13px] text-muted-foreground">Tap one to start</p>
                {data.suggestedOpeners.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setDraft(o)}
                    className="max-w-[85%] rounded-[18px] border border-primary/35 px-3.5 py-2 text-left text-[15px] leading-snug text-foreground transition-colors hover:bg-primary/10"
                  >
                    {o}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <ol className="mx-auto flex max-w-3xl flex-col pt-2" role="log" aria-live="polite" aria-label={`Conversation with ${data.user.name}`}>
            {groupMessages(data.messages).map((g, gi, groups) => {
              const mine = g.from === ME_ID;
              const prev = groups[gi - 1];
              // A centered time stamp starts each day, and any run after a long quiet spell.
              const stamp = !prev || !sameDay(prev.day, g.day) || new Date(g.day).getTime() - new Date(prev.messages.at(-1)!.sentAt).getTime() > STAMP_GAP_MS;
              const lastGroup = gi === groups.length - 1;
              const last = g.messages.at(-1)!;
              return (
                <Fragment key={g.messages[0].id}>
                  {stamp ? (
                    <li className="mb-1 mt-4 text-center text-[11px] text-muted-foreground">
                      <span className="font-semibold">{dayLabel(g.day)}</span> {clockTime(g.day)}
                    </li>
                  ) : null}
                  <li className={cn("flex flex-col gap-[3px]", stamp ? "mt-1" : "mt-3", mine ? "items-end pr-1.5" : "items-start pl-1.5")}>
                    {g.messages.map((m, mi) =>
                      m.kind === "swap" ? (
                        <SongSwapCard key={m.id} id={`swap-${m.swap.id}`} swap={m.swap} mine={mine} otherName={data.user.name} otherId={userId} />
                      ) : (
                        <p
                          key={m.id}
                          className={cn(
                            "max-w-[78%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-[7px] text-[16px] leading-[1.35] lg:max-w-[520px]",
                            mine ? "bg-primary text-primary-foreground" : "bg-[var(--bubble-theirs)] text-foreground",
                            mi === g.messages.length - 1 && (mine ? "bubble-tail-mine" : "bubble-tail-theirs"),
                            m.id.startsWith(PENDING) && "opacity-70",
                          )}
                        >
                          {m.text}
                        </p>
                      ),
                    )}
                    {lastGroup && mine ? (
                      <span className="mt-0.5 pr-1 text-[11px] font-medium text-muted-foreground">{last.id.startsWith(PENDING) ? "Sending…" : "Delivered"}</span>
                    ) : null}
                  </li>
                </Fragment>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
      </main>

      {sendError ? (
        <p role="alert" className="px-4 pt-2 text-center text-xs text-destructive">
          {sendError}
        </p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2 bg-background/80 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:px-8"
      >
        <Link
          href={`/messages/${userId}/swap`}
          aria-label="Send a song (Song Swap)"
          title="Send a song"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-primary transition-colors hover:bg-white/[0.14]"
        >
          <Disc3 className="size-5" aria-hidden />
        </Link>
        <div className="flex min-h-9 flex-1 items-end rounded-[20px] border border-white/15 bg-transparent py-[3px] pl-3.5 pr-[3px] transition-colors focus-within:border-white/30">
          <label className="sr-only" htmlFor="chat-input">
            Message
          </label>
          <textarea
            id="chat-input"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              send();
            }}
            placeholder="Message"
            className="field-sizing-content max-h-32 min-h-7 flex-1 resize-none bg-transparent py-[3px] text-[16px] leading-[1.35] outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[opacity,transform] active:scale-90 disabled:opacity-0"
          >
            <ArrowUp className="size-4" strokeWidth={2.6} aria-hidden />
          </button>
        </div>
      </form>
    </div>
  );
}
