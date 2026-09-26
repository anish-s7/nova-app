"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Search } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { SONG_CATALOG } from "@/lib/music-context";
import { addPick, effectiveSongs, getSession, useSession } from "@/lib/session";
import { describePick, type SongLayer, type SongPick } from "@/lib/song-layer";
import { THEME_THRESHOLD, THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";

export type AddedInfo = ReturnType<typeof describePick>;

const MAX_THEMES = 2;

/** Add a song to the galaxy with the reason in your own words. The star lands (or brightens) where its listeners are. */
export function AddSongSheetContent({ layer, initialSongId, onAdded }: { layer: SongLayer; initialSongId?: string | null; onAdded: (info: AddedInfo) => void }) {
  const session = useSession();
  const [query, setQuery] = useState("");
  const [songId, setSongId] = useState<string | null>(initialSongId ?? null);
  const [themes, setThemes] = useState<ThemeId[]>([]);
  const [reason, setReason] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  // Focus without letting the browser scroll the page to a sheet that is still sliding in.
  useEffect(() => searchRef.current?.focus({ preventScroll: true }), []);

  const owned = useMemo(() => new Set([...effectiveSongs(session).map((s) => s.id), ...(session.picks ?? []).map((p) => p.songId)]), [session]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? SONG_CATALOG.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q)) : SONG_CATALOG.filter((s) => !owned.has(s.id));
    return pool.slice(0, 5);
  }, [query, owned]);
  const chosen = songId ? SONG_CATALOG.find((s) => s.id === songId) : undefined;

  const toggle = (id: ThemeId) => setThemes((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= MAX_THEMES ? t : [...t, id]));

  const submit = () => {
    if (!chosen) return;
    const pick: SongPick = { songId: chosen.id, reason: reason.trim(), themes, addedAt: Date.now() };
    const info = describePick(getSession().picks ?? [], pick);
    addPick(pick);
    onAdded(info);
  };

  if (!chosen) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="font-serif text-xl italic">Add a song to the galaxy</h2>
        <label className="flex min-h-11 items-center gap-2 border border-white/15 px-3">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Song or artist"
            aria-label="Search songs"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <ul className="flex flex-col">
          {results.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setSongId(s.id)} className="flex min-h-14 w-full items-center gap-3 py-1.5 text-left hover:bg-white/5">
                <AlbumArt song={s} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold leading-tight">{s.title}</span>
                  <span className="block truncate text-sm text-muted-foreground">{s.artist}</span>
                </span>
                {owned.has(s.id) ? <span className="text-[11px] text-muted-foreground">in your galaxy</span> : null}
              </button>
            </li>
          ))}
          {results.length === 0 ? <li className="py-3 text-sm text-muted-foreground">Nothing here yet. Song search will use MusicBrainz once it&apos;s wired up.</li> : null}
        </ul>
      </div>
    );
  }

  const existing = layer.stars.find((s) => s.id === chosen.id);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <AlbumArt song={chosen} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">{chosen.title}</p>
          <p className="truncate text-sm text-muted-foreground">{chosen.artist}</p>
          <p className="text-[11px] text-muted-foreground">{existing ? `${existing.listeners.filter((l) => !l.isMe).length} others already have this one` : "Nobody has this yet. You'd put it on the map."}</p>
        </div>
        <button type="button" onClick={() => setSongId(null)} className="min-h-9 px-2 text-xs text-muted-foreground hover:text-foreground">
          Change
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Why does it matter to you? A line is plenty.</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 140))}
          rows={2}
          placeholder="the song I put on when…"
          className="resize-none border border-white/15 bg-transparent p-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-white/30"
        />
        <span className="self-end text-[11px] tabular-nums text-muted-foreground">{reason.length}/140</span>
      </label>

      <fieldset>
        <legend className="mb-1.5 text-xs text-muted-foreground">Where does it live? Pick up to {MAX_THEMES}.</legend>
        <div className="flex flex-wrap gap-1.5">
          {layer.themes.map(({ theme, songIds, formed }) => {
            const on = themes.includes(theme.id);
            const completes = !formed && songIds.length === THEME_THRESHOLD - 1 && !songIds.includes(chosen.id);
            return (
              <button
                key={theme.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(theme.id)}
                style={{ "--tone": THEMES[theme.id].color } as CSSProperties}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  !formed && "border-dashed",
                  on ? "border-[color-mix(in_oklch,var(--tone)_60%,transparent)] bg-[color-mix(in_oklch,var(--tone)_14%,transparent)]" : "border-white/15 text-foreground/80 hover:border-white/30",
                )}
              >
                <span className="size-1.5 rounded-full bg-[var(--tone)]" aria-hidden />
                {theme.short}
                {completes ? <span className="text-[var(--tone)]">would form it</span> : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      <button type="button" onClick={submit} className="min-h-11 bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        {existing?.listeners.some((l) => l.isMe) ? "Update my take" : "Add to the galaxy"}
      </button>
    </div>
  );
}
