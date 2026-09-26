"use client";

import Link from "next/link";
import useSWR from "swr";
import { MessageCircle } from "lucide-react";
import { animate, stagger } from "animejs";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { useAnime } from "@/hooks/use-anime";
import { getConversations, ME_ID } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/time";

function preview(m?: Message) {
  if (!m) return "Say hello";
  const prefix = m.fromUserId === ME_ID ? "You: " : "";
  return m.kind === "swap" ? `${prefix}Song Swap · ${m.swap.song.title}` : `${prefix}${m.text}`;
}

export default function MessagesPage() {
  const { version } = useSession();
  const { data } = useSWR(["conversations", version], getConversations, { refreshInterval: 4000 });
  // Entrance plays once when the list first appears, not on every 4s refresh.
  const list = useAnime<HTMLUListElement>(() => {
    animate("li", { opacity: [0, 1], translateX: [-10, 0], duration: 550, delay: stagger(50), ease: "outQuart" });
  }, [!!data?.length]);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Messages" />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {!data ? (
          <ul className="flex flex-col gap-1 px-2" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-16 rounded-2xl" />
              </li>
            ))}
          </ul>
        ) : data.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            body="Open a Connection Card and send a Song Swap. It's easier than starting from nothing."
            action={
              <Link href="/connections" className={cn(buttonVariants(), "h-11 rounded-full px-6")}>
                See connections
              </Link>
            }
          />
        ) : (
          <ul ref={list} className="flex flex-col">
            {data.map((c) => (
              <li key={c.userId}>
                <Link href={`/messages/${c.userId}`} className="flex min-h-16 items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
                  <UserAvatar name={c.name} cluster={c.cluster} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate font-semibold">{c.name}</p>
                      {c.lastMessage ? <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(c.lastMessage.sentAt)}</span> : null}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{preview(c.lastMessage)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
