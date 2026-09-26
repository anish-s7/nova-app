"use client";

import { useDeferredValue, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Check, Search } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { ScreenHeader } from "@/components/screen-header";
import { SongTile } from "@/components/song-tile";
import { Button } from "@/components/ui/button";
import { getConversation, searchSongs, sendSongSwap } from "@/lib/api";
import { SONG_CATALOG } from "@/lib/music-context";
import { effectiveSongs, getSession, useSession } from "@/lib/session";
import { buildSongLayer } from "@/lib/song-layer";
import type { Song } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SongSwapComposer({ userId, replyToSwapId, initialSongId }: { userId: string; replyToSwapId?: string; initialSongId?: string }) {
  const router = useRouter();
  const session = useSession();
  const { data: convo } = useSWR(["conversation", userId], ([, id]) => getConversation(id));
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const { data: results } = useSWR(deferred ? ["songs", deferred] : null, ([, q]) => searchSongs(q), { keepPreviousData: true });
  // Arriving from a song in the galaxy: the song is already chosen, so the only thing left is why.
  const [song, setSong] = useState<Song | null>(() => SONG_CATALOG.find((s) => s.id === initialSongId) ?? null);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  const name = convo?.user.name ?? "them";
  const incoming = replyToSwapId
    ? convo?.messages.find((m) => m.kind === "swap" && m.swap.id === replyToSwapId)
    : undefined;
  const theyHaveIt = song ? buildSongLayer(getSession().picks ?? []).stars.find((s) => s.id === song.id)?.listeners.some((l) => l.id === userId) : false;
  const list = deferred ? (results ?? []) : effectiveSongs(session);

  async function send() {
    if (!song || !reason.trim() || sending) return;
    setSending(true);
    try {
      await sendSongSwap(userId, song, reason.trim(), replyToSwapId);
      router.replace(`/messages/${userId}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <ScreenHeader onBack={() => router.back()} title={replyToSwapId ? "Send one back" : "Song Swap"} subtitle={`One song, one reason, for ${name}`} />
      <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {incoming && incoming.kind === "swap" ? (
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-card/50 p-3">
            <AlbumArt song={incoming.swap.song} size={44} />
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              {name} sent <span className="text-foreground">{incoming.swap.song.title}</span>: <span className="font-serif italic">&ldquo;{incoming.swap.reason}&rdquo;</span>
            </p>
          </div>
        ) : null}

        <section className="mt-5" aria-labelledby="song-step">
          <h2 id="song-step" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            1 · Pick a song
          </h2>
          <label className="mt-2 flex h-12 items-center gap-2 rounded-full border border-white/10 bg-card/60 px-4 focus-within:border-primary/60">
            <Search className="size-4 text-muted-foreground" aria-hidden />
            <span className="sr-only">Search songs</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, or pick from yours below" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
          </label>
          <ul className="mt-2 flex max-h-72 flex-col overflow-y-auto">
            {list.map((s) => {
              const picked = song?.id === s.id;
              return (
                <li key={s.id}>
                  <button type="button" onClick={() => setSong(s)} aria-pressed={picked} className={cn("w-full rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/5", picked && "bg-primary/10")}>
                    <SongTile song={s} artSize={40} trailing={picked ? <Check className="size-5 text-primary" aria-hidden /> : null} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-6" aria-labelledby="reason-step">
          <h2 id="reason-step" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            2 · Why this one, for {name}?
          </h2>
          {theyHaveIt ? <p className="mt-1 text-sm text-primary">{name} has this one too. Tell them what it is for you.</p> : null}
          <label htmlFor="swap-reason" className="sr-only">
            Your reason
          </label>
          <textarea
            id="swap-reason"
            rows={3}
            maxLength={160}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="This is the one I play when…"
            className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-card/60 px-4 py-3 font-serif text-base italic outline-none placeholder:text-muted-foreground focus:border-primary/50"
          />
          <p className="text-right text-xs tabular-nums text-muted-foreground">{reason.length}/160</p>
        </section>
      </main>
      <div className="border-t border-white/[0.07] bg-background/95 px-5 pb-6 pt-3">
        <Button className="h-12 w-full rounded-full text-base" disabled={!song || !reason.trim() || sending} onClick={send}>
          {song ? `Send ${song.title}` : "Pick a song first"}
        </Button>
      </div>
    </>
  );
}
