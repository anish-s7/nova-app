"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowUp, Disc3, Sparkles } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { SongSwapCard } from "@/components/song-swap-card";
import { ThemeTag } from "@/components/theme-tag";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { getConversation, ME_ID, sendMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

export function ChatView({ userId, initialDraft }: { userId: string; initialDraft: string }) {
  const { data, error, mutate } = useSWR(["conversation", userId], ([, id]) => getConversation(id), { refreshInterval: 2000 });
  const [draft, setDraft] = useState(initialDraft);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [count]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendMessage(userId, text);
      setDraft("");
      await mutate();
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <ScreenHeader
        backHref="/messages"
        title={
          data ? (
            <Link href={`/people/${userId}`} className="inline-flex items-center gap-2.5 rounded-full py-1 pr-2 hover:bg-white/5">
              <UserAvatar name={data.user.name} cluster={data.cluster} size={32} />
              <span className="font-semibold">{data.user.name}</span>
            </Link>
          ) : (
            <Skeleton className="h-7 w-28" />
          )
        }
        trailing={
          <Link href={`/people/${userId}/card`} aria-label="View Connection Card" className="inline-flex size-11 items-center justify-center rounded-full text-primary hover:bg-white/5">
            <Sparkles className="size-5" aria-hidden />
          </Link>
        }
      />

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4" aria-live="polite">
        {error ? (
          <p className="py-16 text-center text-muted-foreground">{error.message}</p>
        ) : !data ? (
          <div className="flex flex-col gap-3 pt-4" aria-busy="true">
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center pb-4 pt-6 text-center">
              <UserAvatar name={data.user.name} cluster={data.cluster} size={64} ring />
              {data.sharedMotivation ? (
                <>
                  <p className="mt-3 font-serif text-base italic text-muted-foreground">You both listen for</p>
                  <ThemeTag label={data.sharedMotivation} size="sm" className="mt-1.5" />
                </>
              ) : null}
            </div>

            {data.messages.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">Try one of these</p>
                {data.suggestedOpeners.map((o) => (
                  <button key={o} type="button" onClick={() => setDraft(o)} className="rounded-2xl border border-white/10 bg-card/60 px-4 py-3 text-left font-serif text-[15px] italic transition-colors hover:border-primary/40">
                    &ldquo;{o}&rdquo;
                  </button>
                ))}
              </div>
            ) : (
              <ol className="flex flex-col gap-2">
                {data.messages.map((m) => {
                  const mine = m.fromUserId === ME_ID;
                  return (
                    <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                      {m.kind === "swap" ? (
                        <SongSwapCard swap={m.swap} mine={mine} otherName={data.user.name} otherId={userId} />
                      ) : (
                        <p
                          className={cn(
                            "max-w-[80%] whitespace-pre-wrap text-pretty rounded-3xl px-4 py-2.5 text-[15px] leading-snug motion-safe:animate-rise-in",
                            mine ? "rounded-br-lg bg-primary text-primary-foreground" : "rounded-bl-lg bg-card text-foreground",
                          )}
                        >
                          {m.text}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <div ref={endRef} />
          </>
        )}
      </main>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-2 border-t border-white/[0.07] bg-background/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
      >
        <Link href={`/messages/${userId}/swap`} aria-label="Send a Song Swap" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-primary hover:bg-card/80">
          <Disc3 className="size-5" aria-hidden />
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
          placeholder="Message"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-white/10 bg-card px-4 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground focus:border-primary/50"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
        >
          <ArrowUp className="size-5" aria-hidden />
        </button>
      </form>
    </>
  );
}
