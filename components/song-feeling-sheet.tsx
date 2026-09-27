"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { AlbumArt } from "@/components/album-art";
import { BottomSheet } from "@/components/bottom-sheet";
import { MoodCircle } from "@/components/mood-circle";
import { TagPicker } from "@/components/tag-picker";
import { Button } from "@/components/ui/button";
import { removeSong, updateSongFeeling, type MySong } from "@/lib/api";
import type { Feeling } from "@/lib/session";
import { cn } from "@/lib/utils";

/**
 * Edit one of your saved songs: change how it feels (same tag picker + mood circle as onboarding)
 * or remove it. Saving updates the existing pick in place; nothing is duplicated.
 */
export function SongFeelingSheet({ item, onClose, onChanged }: { item: MySong | null; onClose: () => void; onChanged: () => void }) {
  return (
    <BottomSheet open={!!item} onClose={onClose} label={item ? `Edit ${item.song.title}` : "Edit song"}>
      {/* Keyed so each song starts from its own saved feelings. */}
      {item ? <Editor key={item.pickId} item={item} onClose={onClose} onChanged={onChanged} /> : null}
    </BottomSheet>
  );
}

function Editor({ item, onClose, onChanged }: { item: MySong; onClose: () => void; onChanged: () => void }) {
  const [feeling, setFeeling] = useState<Feeling>(item.feeling);
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState("");

  const changed =
    feeling.valence !== item.feeling.valence ||
    feeling.energy !== item.feeling.energy ||
    feeling.tags.length !== item.feeling.tags.length ||
    feeling.tags.some((t) => !item.feeling.tags.includes(t));

  const run = async (kind: "save" | "remove", action: () => Promise<void>) => {
    setBusy(kind);
    setError("");
    try {
      await action();
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center gap-3">
        <AlbumArt song={item.song} size={56} className="rounded-md" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-tight">{item.song.title}</p>
          <p className="truncate text-sm text-muted-foreground">{item.song.artist}</p>
        </div>
      </div>

      <div className="-mx-5 mt-4 min-h-0 flex-1 overflow-y-auto px-5">
        <TagPicker value={feeling.tags} onChange={(tags) => setFeeling((f) => ({ ...f, tags }))} label={`Tags for ${item.song.title}`} />
        <div className="mt-6 flex justify-center">
          <MoodCircle
            value={{ valence: feeling.valence, energy: feeling.energy }}
            placed={feeling.placed}
            onChange={(mood) => setFeeling((f) => ({ ...f, ...mood, placed: true }))}
            label={`How ${item.song.title} makes you feel`}
            size={200}
          />
        </div>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => (confirmRemove ? run("remove", () => removeSong(item.pickId)) : setConfirmRemove(true))}
          className={cn(
            "inline-flex h-12 shrink-0 items-center justify-center gap-1.5 border px-4 text-sm font-medium transition-colors disabled:opacity-50",
            confirmRemove ? "border-destructive/60 text-destructive hover:bg-destructive/10" : "border-white/15 text-muted-foreground hover:text-foreground",
          )}
        >
          {busy === "remove" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
          {confirmRemove ? "Tap to confirm" : "Remove"}
        </button>
        <Button
          className="h-12 flex-1 rounded-none text-base"
          disabled={!changed || feeling.tags.length === 0 || busy !== null}
          onClick={() => run("save", () => updateSongFeeling(item.pickId, feeling))}
        >
          {busy === "save" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {feeling.tags.length === 0 ? "Pick at least one tag" : changed ? "Save changes" : "No changes"}
        </Button>
      </div>
    </div>
  );
}
