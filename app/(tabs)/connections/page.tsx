"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight, Search } from "lucide-react";
import { animate, stagger } from "animejs";
import { ScreenHeader } from "@/components/screen-header";
import { SongStack } from "@/components/song-stack";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { useAnime } from "@/hooks/use-anime";
import { getConnections } from "@/lib/api";
import { Input } from "@/components/ui/input";
import {
  filterConnections,
  groupByWhy,
  SORT_LABELS,
  sortConnections,
  type ConnectionSort,
} from "@/lib/connection-groups";
import { useSession } from "@/lib/session";
import { ClusterStar } from "@/components/cluster-star";

const GROUP_PREVIEW = 5;

export default function ConnectionsPage() {
  const { version } = useSession();
  const { data, error, mutate } = useSWR(
    ["connections", version],
    getConnections,
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ConnectionSort>("match");
  const [grouped, setGrouped] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const searching = query.trim().length > 0;
  const groups = useMemo(() => {
    if (!data) return [];
    const found = filterConnections(data, query);
    if (grouped) return groupByWhy(found, sort);
    return found.length
      ? [
          {
            cluster: "all",
            label: "Everyone",
            color: "var(--muted-foreground)",
            people: sortConnections(found, sort),
          },
        ]
      : [];
  }, [data, query, sort, grouped]);
  const list = useAnime<HTMLDivElement>(() => {
    animate("section", {
      opacity: [0, 1],
      translateY: [14, 0],
      duration: 600,
      delay: stagger(55),
      ease: "outQuart",
    });
  }, [!!data]);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        title="Connections"
        subtitle="Ranked by why you listen, not what"
        className="lg:px-10 lg:pt-6"
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 lg:px-10">
        {error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-muted-foreground">
              We couldn&apos;t bring up who you match with.
            </p>
            <Button
              variant="secondary"
              className="rounded-full"
              onClick={() => mutate()}
            >
              Try again
            </Button>
          </div>
        ) : !data ? (
          <ul className="mt-2 grid gap-2 lg:grid-cols-2 lg:gap-x-10 2xl:grid-cols-3" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-24 rounded-2xl" />
              </li>
            ))}
          </ul>
        ) : (
          <div ref={list} className="mt-2 flex flex-col gap-5 lg:gap-8">
            <div className="flex flex-col gap-2 lg:max-w-xl">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people, songs, artists"
                  aria-label="Search connections"
                  className="h-10 rounded-full pl-9"
                />
              </div>
              <div className="flex items-center gap-2 text-xs">
                <label className="flex items-center gap-1.5 text-muted-foreground">
                  Sort
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as ConnectionSort)}
                    className="rounded-full border border-white/10 bg-card px-2.5 py-1.5 text-foreground"
                  >
                    {(Object.keys(SORT_LABELS) as ConnectionSort[]).map((k) => (
                      <option key={k} value={k}>
                        {SORT_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  aria-pressed={grouped}
                  onClick={() => setGrouped((g) => !g)}
                  className="ml-auto rounded-full border border-white/10 px-3 py-1.5 text-muted-foreground aria-pressed:bg-white/10 aria-pressed:text-foreground"
                >
                  Group
                </button>
              </div>
            </div>
            {!groups.length ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No one matches &ldquo;{query}&rdquo;.
              </p>
            ) : null}
            {/* Laptops: the groups sit side by side instead of in one long column. */}
            <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10 lg:gap-y-8 2xl:grid-cols-3">
              {groups.map((g) => (
                <section key={g.cluster} aria-label={g.label} className="lg:rounded-3xl lg:border lg:border-white/[0.07] lg:bg-card/30 lg:p-4">
                  <h2 className="mb-1 flex items-center gap-2 px-1 text-sm font-medium">
                    <ClusterStar color={g.color} size={12} />
                    {g.label}
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {g.people.length}
                    </span>
                  </h2>
                  <ul className="flex flex-col divide-y divide-white/[0.06]">
                    {(searching || expanded.has(g.cluster)
                      ? g.people
                      : g.people.slice(0, GROUP_PREVIEW)
                    ).map((c) => (
                      <li key={c.user.id}>
                        <Link
                          href={`/people/${c.user.id}/card`}
                          className="flex items-center gap-3 rounded-xl px-1 py-3 transition-colors hover:bg-white/[0.04]"
                        >
                          <UserAvatar
                            name={c.user.name}
                            cluster={c.cluster}
                            userId={c.user.id}
                            size={40}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{c.user.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {c.sharedMotivation ||
                                (c.sharedSongs > 0
                                  ? `${c.sharedSongs} shared song${c.sharedSongs === 1 ? "" : "s"}`
                                  : `${c.sharedArtists} shared artist${c.sharedArtists === 1 ? "" : "s"}`)}
                            </p>
                          </div>
                          <SongStack
                            songs={c.evidenceSongs}
                            total={
                              c.sharedSongs > 0 ? c.sharedSongs : c.sharedArtists
                            }
                          />
                          <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                            {Math.round(c.similarity * 100)}% match
                          </span>
                          <ChevronRight
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {!searching && g.people.length > GROUP_PREVIEW ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => {
                          const n = new Set(prev);
                          if (n.has(g.cluster)) n.delete(g.cluster);
                          else n.add(g.cluster);
                          return n;
                        })
                      }
                      className="mt-1 w-full rounded-xl py-2 text-xs text-muted-foreground hover:bg-white/[0.04]"
                    >
                      {expanded.has(g.cluster)
                        ? "Show less"
                        : `Show ${g.people.length - GROUP_PREVIEW} more`}
                    </button>
                  ) : null}
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
