"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowUp, Disc3, Sparkles } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { SongSwapCard } from "@/components/song-swap-card";
import { ThemeTag } from "@/components/theme-tag";
import { ThreadStrip } from "@/components/thread-strip";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { getConversation, ME_ID, sendMessage } from "@/lib/api";
import { getCluster } from "@/lib/clusters";
import { markRead } from "@/lib/read-state";
import { threadFrom } from "@/lib/thread";
import { clockTime, dayLabel, sameDay } from "@/lib/time";
import type { Conversation, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

const PENDING = "pending-";
/** Messages from the same person this close together read as one group. */
const GROUP_GAP_MS = 5 * 60_000;

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
    <>
      <ScreenHeader
        backHref="/messages"
        title={
          data ? (
            <Link href={`/people/${userId}`} className="inline-flex items-center gap-2.5 py-1 pr-2 hover:opacity-80">
              <UserAvatar name={data.user.name} cluster={data.cluster} userId={data.user.id} size={32} />
              <span className="min-w-0">
                <span className="block truncate font-semibold leading-tight">{data.user.name}</span>
                {data.sharedMotivation ? (
                  <span className="flex items-center gap-1.5 truncate text-xs font-normal text-muted-foreground">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: getCluster(data.cluster).color }} aria-hidden />
                    {data.sharedMotivation}
                  </span>
                ) : null}
              </span>
            </Link>
          ) : (
            <Skeleton className="h-8 w-36" />
          )
        }
        trailing={
          <Link href={`/people/${userId}/card`} aria-label="View Connection Card" className="inline-flex size-11 items-center justify-center text-primary hover:bg-white/5">
            <Sparkles className="size-5" aria-hidden />
          </Link>
        }
        className="border-b border-white/[0.07] pb-2"
      />

      {data && thread ? <ThreadStrip thread={thread} name={data.user.name} userId={userId} onJumpToPending={pendingSwapId ? jumpToPending : undefined} /> : null}

      <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {error ? (
          <p className="py-16 text-center text-muted-foreground">{error.message}</p>
        ) : !data ? (
          <div className="flex flex-col gap-3 pt-4" aria-busy="true">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
          </div>
        ) : data.messages.length === 0 ? (
          <div className="flex flex-col items-center pb-2 pt-8 text-center">
            <UserAvatar name={data.user.name} cluster={data.cluster} userId={data.user.id} size={64} ring />
            <p className="mt-3 font-semibold">{data.user.name}</p>
            {data.sharedMotivation ? (
              <>
                <p className="mt-3 font-serif text-base italic text-muted-foreground">You both listen for</p>
                <ThemeTag label={data.sharedMotivation} size="sm" className="mt-1.5" />
              </>
            ) : null}
            {data.suggestedOpeners.length ? (
              <div className="mt-8 flex w-full flex-col gap-2 text-left">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Start with one of these</p>
                {data.suggestedOpeners.map((o) => (
                  <button key={o} type="button" onClick={() => setDraft(o)} className="border-l-2 border-primary/50 bg-card/40 px-4 py-3 text-left font-serif text-[15px] italic transition-colors hover:bg-card/70">
                    &ldquo;{o}&rdquo;
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <ol className="flex flex-col pt-3" role="log" aria-live="polite" aria-label={`Conversation with ${data.user.name}`}>
            {groupMessages(data.messages).map((g, gi, groups) => {
              const mine = g.from === ME_ID;
              const newDay = gi === 0 || !sameDay(groups[gi - 1].day, g.day);
              const last = g.messages.at(-1)!;
              return (
                <Fragment key={g.messages[0].id}>
                  {newDay ? (
                    <li className="my-3 flex items-center gap-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground" aria-label={dayLabel(g.day)}>
                      <span className="h-px flex-1 bg-white/[0.07]" aria-hidden />
                      {dayLabel(g.day)}
                      <span className="h-px flex-1 bg-white/[0.07]" aria-hidden />
                    </li>
                  ) : null}
                  <li className={cn("mt-2 flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
                    {mine ? null : <UserAvatar name={data.user.name} cluster={data.cluster} userId={data.user.id} size={26} className="mb-5" />}
                    <div className={cn("flex min-w-0 max-w-[82%] flex-col gap-1", mine ? "items-end" : "items-start")}>
                      {g.messages.map((m, mi) =>
                        m.kind === "swap" ? (
                          <SongSwapCard key={m.id} id={`swap-${m.swap.id}`} swap={m.swap} mine={mine} otherName={data.user.name} otherId={userId} />
                        ) : (
                          <p
                            key={m.id}
                            className={cn(
                              "whitespace-pre-wrap text-pretty rounded-2xl px-4 py-2.5 text-[15px] leading-snug",
                              mine ? "bg-primary text-primary-foreground" : "bg-card text-foreground",
                              mi === g.messages.length - 1 && (mine ? "rounded-br-sm" : "rounded-bl-sm"),
                              m.id.startsWith(PENDING) && "opacity-70",
                            )}
                          >
                            {m.text}
                          </p>
                        ),
                      )}
                      <span className="px-1 text-[11px] text-muted-foreground">{last.id.startsWith(PENDING) ? "Sending…" : clockTime(last.sentAt)}</span>
                    </div>
                  </li>
                </Fragment>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
      </main>

      {sendError ? (
        <p role="alert" className="border-t border-white/[0.07] px-4 pt-2 text-xs text-destructive">
          {sendError}
        </p>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2 border-t border-white/[0.07] bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
      >
        <Link href={`/messages/${userId}/swap`} className="inline-flex h-11 shrink-0 items-center gap-1.5 border border-white/15 px-3 text-sm font-medium text-primary hover:bg-white/5">
          <Disc3 className="size-4" aria-hidden />
          Song
          <span className="sr-only">Swap: send a song</span>
        </Link>
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
          placeholder="Say something…"
          className="max-h-32 min-h-11 flex-1 resize-none border border-white/10 bg-card/60 px-3 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground focus:border-primary/50"
        />
        <button type="submit" disabled={!draft.trim()} aria-label="Send" className="inline-flex size-11 shrink-0 items-center justify-center bg-primary text-primary-foreground transition-opacity disabled:opacity-40">
          <ArrowUp className="size-5" aria-hidden />
        </button>
      </form>
    </>
  );
}
