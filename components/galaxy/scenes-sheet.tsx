"use client";

import useSWR from "swr";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { getScenes, getSceneDetail } from "@/lib/api";

/**
 * docs/plans/galaxy-communities.md, step 6: the real "enter a music scene" UI. Two entry points into the
 * same detail view: this list (a fallback for anyone who doesn't spot the distant discs), and tapping a
 * real `GalaxyDestination` rendered in the canvas itself (the actual "other galaxies in the background"
 * visual — wired in app/(tabs)/galaxy/page.tsx via `computeHomeLayout`'s `destinations`/`bridges`, the
 * same machinery `/pitch` already uses with fictional data, now fed real scenes/gateways).
 */
export function ScenesSheetContent({ onSelectScene }: { onSelectScene: (id: string) => void }) {
  const { data: scenes, error: listError } = useSWR("scenes", getScenes, { revalidateOnFocus: false });

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="font-serif text-xl italic leading-snug">Listening scenes</h2>
        <p className="mt-1 text-xs text-muted-foreground">Musical communities, not emotional ones — sound-based, not why-based. Real, not scripted.</p>
      </div>

      {listError ? (
        <p className="py-2 text-sm text-muted-foreground">{listError.message}</p>
      ) : !scenes ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : scenes.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No published scenes yet.</p>
      ) : (
        <ul className="-mx-1 flex max-h-[52vh] flex-col overflow-y-auto px-1">
          {scenes.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onSelectScene(s.id)}
                className="flex w-full items-center gap-3 border-b border-white/5 py-3 text-left hover:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.label}</p>
                  {s.description ? <p className="mt-0.5 line-clamp-2 text-pretty text-xs leading-snug text-foreground/80">{s.description}</p> : null}
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SceneDetailView({ sceneId, onBack, onEnter }: { sceneId: string; onBack?: () => void; onEnter: (profileId: string, name: string) => void }) {
  const { data, error } = useSWR(["scene", sceneId], () => getSceneDetail(sceneId), { revalidateOnFocus: false });

  return (
    <div className="flex flex-col gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-3.5" aria-hidden /> All scenes
        </button>
      ) : null}

      {error ? (
        <p className="py-2 text-sm text-muted-foreground">{error.message}</p>
      ) : !data ? (
        <>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-16 w-full" />
        </>
      ) : (
        <>
          <div>
            <h2 className="font-serif text-xl italic leading-snug">{data.scene.label}</h2>
            {data.scene.description ? <p className="mt-1 text-xs text-muted-foreground">{data.scene.description}</p> : null}
          </div>

          {data.novelSong ? (
            <div className="border-l-2 border-primary/50 pl-3">
              <p className="text-sm font-medium">
                {data.novelSong.title} <span className="font-normal text-muted-foreground">by {data.novelSong.artist}</span>
              </p>
              <p className="mt-1 text-pretty text-xs leading-snug text-foreground/85">{data.novelSong.relevance}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing new here for you yet — you already have every song this scene would introduce you to.</p>
          )}

          {data.locked || !data.gateway ? (
            <p className="text-sm text-muted-foreground">No one you know is in this scene yet — check back as more people join.</p>
          ) : (
            <div className="flex items-center gap-3">
              <UserAvatar name={data.gateway.displayName} cluster={data.gateway.cluster} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <span className="font-medium">{data.gateway.displayName}</span> <span className="text-muted-foreground">is your closest bridge into this scene</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">via &quot;{data.gateway.songTitle}&quot; by {data.gateway.songArtist}</p>
              </div>
            </div>
          )}

          {!data.locked && data.gateway ? (
            <Button variant="secondary" className="h-11" onClick={() => onEnter(data.gateway!.profileId, data.gateway!.displayName)}>
              Say hi via {data.gateway.displayName}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
