"use client";

import { useDeferredValue, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Search } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { ScreenHeader } from "@/components/screen-header";
import { SongSwapCard } from "@/components/song-swap-card";
import { SongTile } from "@/components/song-tile";
import { Button } from "@/components/ui/button";
import { getConversation, ME_ID, searchSongs, sendSongSwap } from "@/lib/api";
import { SONG_CATALOG } from "@/lib/music-context";
import { effectiveSongs, getSession, useSession } from "@/lib/session";
import { buildSongLayer } from "@/lib/song-layer";
import type { Song } from "@/lib/types";

const MAX_REASON = 160;
/** Starting lines for the blank-box problem. Tapping one puts it in the box to finish. */
const PROMPTS = ["I play this when ", "This reminds me of ", "You should hear this because "];

export function SongSwapComposer({ userId, replyToSwapId, initialSongId, initialReason }: { userId: string; replyToSwapId?: string; initialSongId?: string; initialReason?: string }) {
  const router = useRouter();
  const session = useSession();
  const { data: convo } = useSWR(["conversation", userId], ([, id]) => getConversation(id));
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const { data: results } = useSWR(deferred ? ["songs", deferred] : null, ([, q]) => searchSongs(q), { keepPreviousData: true });
  // Arriving from a song in the galaxy: the song is already chosen, so the only thing left is why.
  const [song, setSong] = useState<Song | null>(() => SONG_CATALOG.find((s) => s.id === initialSongId) ?? null);
  // An opener from a bridge song arrives prefilled and editable; it is a starting line, not something sent for them.
  const [reason, setReason] = useState(initialReason ?? "");
  const [sending, setSending] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const name = convo?.user.name ?? "them";
  const incoming = replyToSwapId ? convo?.messages.find((m) => m.kind === "swap" && m.swap.id === replyToSwapId) : undefined;
  const theyHaveIt = song ? buildSongLayer(getSession().picks ?? []).stars.find((s) => s.id === song.id)?.listeners.some((l) => l.id === userId) : false;
  const list = deferred ? (results ?? []) : effectiveSongs(session);

  const pick = (s: Song) => {
    setSong(s);
    setQuery("");
    // Straight on to step 2.
    requestAnimationFrame(() => reasonRef.current?.focus());
  };

  const applyPrompt = (p: string) => {
    setReason((r) => (r.trim() ? r : p));
    requestAnimationFrame(() => {
      const el = reasonRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

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

  const stepLabel = "text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

  return (
    <>
      <ScreenHeader onBack={() => router.back()} title={replyToSwapId ? "Send one back" : "Song Swap"} subtitle={`One song, one reason, for ${name}`} className="border-b border-white/[0.07] pb-2" />
      <main className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {incoming && incoming.kind === "swap" ? (
          <div className="mt-4 flex items-center gap-3 border-l-2 border-white/20 bg-card/40 p-3">
            <AlbumArt song={incoming.swap.song} size={40} className="rounded-md" />
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              {name} sent <span className="text-foreground">{incoming.swap.song.title}</span>: <span className="font-serif italic">&ldquo;{incoming.swap.reason}&rdquo;</span>
            </p>
          </div>
        ) : null}

        <section className="mt-5" aria-labelledby="song-step">
          <h2 id="song-step" className={stepLabel}>
            1 · The song
          </h2>
          {song ? (
            <div className="mt-2 flex items-center gap-3 border border-white/10 bg-card/50 p-2 pr-3">
              <SongTile song={song} artSize={44} className="min-w-0 flex-1" />
              <button type="button" onClick={() => setSong(null)} className="shrink-0 px-2 py-1 text-sm text-muted-foreground hover:text-foreground">
                Change
              </button>
            </div>
          ) : (
            <>
              <label className="mt-2 flex h-12 items-center gap-2 border border-white/10 bg-card/50 px-4 focus-within:border-primary/60">
                <Search className="size-4 text-muted-foreground" aria-hidden />
                <span className="sr-only">Search songs</span>
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, or pick from yours below" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
              </label>
              {!deferred ? <p className="mt-3 text-xs text-muted-foreground">Your songs</p> : null}
              <ul className="mt-1 flex flex-col divide-y divide-white/[0.05]">
                {list.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => pick(s)} className="w-full px-1 py-2 text-left transition-colors hover:bg-white/[0.04]">
                      <SongTile song={s} artSize={40} />
                    </button>
                  </li>
                ))}
                {deferred && results && results.length === 0 ? <li className="py-6 text-center text-sm text-muted-foreground">No songs match &ldquo;{deferred}&rdquo;.</li> : null}
              </ul>
            </>
          )}
        </section>

        {song ? (
          <>
            <section className="mt-6" aria-labelledby="reason-step">
              <h2 id="reason-step" className={stepLabel}>
                2 · Why this one, for {name}?
              </h2>
              {theyHaveIt ? <p className="mt-1 text-sm text-primary">{name} has this one too. Tell them what it is for you.</p> : null}
              {!reason.trim() ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PROMPTS.map((p) => (
                    <button key={p} type="button" onClick={() => applyPrompt(p)} className="border border-white/10 px-2.5 py-1 font-serif text-sm italic text-muted-foreground hover:border-white/25 hover:text-foreground">
                      {p.trim()}…
                    </button>
                  ))}
                </div>
              ) : null}
              <label htmlFor="swap-reason" className="sr-only">
                Your reason
              </label>
              <textarea
                ref={reasonRef}
                id="swap-reason"
                rows={3}
                maxLength={MAX_REASON}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="This is the one I play when…"
                className="mt-2 w-full resize-none border border-white/10 bg-card/50 px-4 py-3 font-serif text-base italic outline-none placeholder:text-muted-foreground focus:border-primary/50"
              />
              <p className="text-right text-xs tabular-nums text-muted-foreground">
                {reason.length}/{MAX_REASON}
              </p>
            </section>

            <section className="mt-4" aria-labelledby="preview-step">
              <h2 id="preview-step" className={stepLabel}>
                What {name} will see
              </h2>
              <div className="mt-2">
                <SongSwapCard preview swap={{ id: "preview", fromUserId: ME_ID, toUserId: userId, song, reason: reason.trim(), status: "pending" }} mine otherName={name} otherId={userId} />
              </div>
            </section>
          </>
        ) : null}
      </main>
      <div className="border-t border-white/[0.07] bg-background/95 px-5 pb-6 pt-3">
        <Button className="h-12 w-full rounded-none text-base" disabled={!song || !reason.trim() || sending} onClick={send}>
          {!song ? "Pick a song first" : !reason.trim() ? "Add a reason" : `Send to ${name}`}
        </Button>
      </div>
    </>
  );
}
