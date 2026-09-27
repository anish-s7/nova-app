"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Disc3 } from "lucide-react";
import { animate, stagger } from "animejs";
import { AlbumArt } from "@/components/album-art";
import { EmptyState } from "@/components/empty-state";
import { ScreenHeader } from "@/components/screen-header";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { useAnime } from "@/hooks/use-anime";
import { getConnections, getConversations, ME_ID } from "@/lib/api";
import { getCluster } from "@/lib/clusters";
import { useIsUnread } from "@/lib/read-state";
import { useSession } from "@/lib/session";
import type { Connection, ConversationSummary, Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/time";
import { ClusterStar } from "@/components/cluster-star";

function Preview({ message }: { message?: Message }) {
  if (!message) return <span className="truncate italic">Say hello</span>;
  const prefix = message.fromUserId === ME_ID ? "You: " : "";
  if (message.kind === "text") return <span className="truncate">{prefix + message.text}</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <AlbumArt song={message.swap.song} size={18} className="rounded-[3px]" />
      <span className="truncate">
        {prefix}
        {message.swap.song.title}
      </span>
    </span>
  );
}

/** What the thread is waiting on, as a small status label. Nothing when there's nothing to do. */
function TurnBadge({ turn }: { turn?: ConversationSummary["turn"] }) {
  if (turn === "mine") return <span className="shrink-0 border border-primary/60 px-1.5 py-0.5 text-[11px] font-medium text-primary">Your turn</span>;
  if (turn === "theirs") return <span className="shrink-0 text-[11px] text-muted-foreground">Their move</span>;
  return null;
}

export default function MessagesPage() {
  const { version } = useSession();
  const isUnread = useIsUnread();
  const { data } = useSWR(["conversations", version], getConversations, { refreshInterval: 4000 });
  const { data: connections } = useSWR(["connections", version], getConnections);

  // People you matched with but haven't talked to yet, best matches first.
  const talking = new Set(data?.map((c) => c.userId));
  const fresh = (connections ?? []).filter((c) => !talking.has(c.user.id)).slice(0, 8);
  const waitingOnYou = data?.filter((c) => c.turn === "mine" || isUnread(c.userId, c.lastMessage)).length ?? 0;

  // Entrance plays once when the list first appears, not on every 4s refresh.
  const list = useAnime<HTMLUListElement>(() => {
    animate("li", { opacity: [0, 1], translateX: [-10, 0], duration: 550, delay: stagger(50), ease: "outQuart" });
  }, [!!data?.length]);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        title="Messages"
        subtitle={data?.length ? (waitingOnYou ? (waitingOnYou === 1 ? "Someone's waiting on you" : `${waitingOnYou} people waiting on you`) : "You're all caught up") : undefined}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {!data ? (
          <ul className="flex flex-col gap-1 px-4" aria-busy="true">
            {Array.from({ length: 4 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-16" />
              </li>
            ))}
          </ul>
        ) : data.length === 0 ? (
          <EmptyState title="It's quiet in here" body="Nobody's said hello yet. A song is an easier first message than 'hey'. Pick someone below to start." />
        ) : (
          <ul ref={list} className="flex flex-col border-y border-white/[0.06]">
            {data.map((c) => {
              const unread = isUnread(c.userId, c.lastMessage);
              return (
                <li key={c.userId} className="border-b border-white/[0.06] last:border-b-0">
                  <Link href={`/messages/${c.userId}`} className="flex min-h-[72px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
                    <span className="relative shrink-0">
                      <UserAvatar name={c.name} cluster={c.cluster} userId={c.userId} size={48} />
                      {unread ? <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-primary ring-2 ring-background" aria-label="Unread" /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={cn("truncate", unread ? "font-semibold text-foreground" : "font-medium")}>{c.name}</p>
                        {c.lastMessage ? <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(c.lastMessage.sentAt)}</span> : null}
                      </div>
                      <div className={cn("mt-0.5 flex items-center gap-2 text-sm", unread ? "text-foreground/90" : "text-muted-foreground")}>
                        <span className="flex min-w-0 flex-1">
                          <Preview message={c.lastMessage} />
                        </span>
                        <TurnBadge turn={c.turn} />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {fresh.length ? <StartConversation people={fresh} /> : null}
      </div>
    </main>
  );
}

/** A row of matches you haven't messaged, so the next step is always on screen. */
function StartConversation({ people }: { people: Connection[] }) {
  return (
    <section className="mt-6" aria-labelledby="start-heading">
      <div className="flex items-baseline justify-between px-4">
        <h2 id="start-heading" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Start a conversation
        </h2>
        <Link href="/connections" className="text-xs text-muted-foreground hover:text-foreground">
          All connections
        </Link>
      </div>
      <ul className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4">
        {people.map((p) => {
          const tone = getCluster(p.cluster).color;
          return (
            <li key={p.user.id} className="w-36 shrink-0">
              <Link
                href={`/messages/${p.user.id}`}
                style={{ "--tone": tone } as CSSProperties}
                className="flex h-full flex-col gap-2 border border-white/10 bg-card/40 p-3 transition-colors hover:border-[color-mix(in_oklch,var(--tone)_50%,transparent)]"
              >
                <UserAvatar name={p.user.name} cluster={p.cluster} userId={p.user.id} size={40} />
                <p className="truncate text-sm font-medium">{p.user.name}</p>
                <p className="line-clamp-2 flex-1 text-xs leading-snug text-muted-foreground">
                  <ClusterStar color="var(--tone)" size={10} className="mr-1" />
                  {p.sharedMotivation}
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--tone)]">
                  <Disc3 className="size-3.5" aria-hidden />
                  Say hello
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
