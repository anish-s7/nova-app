"use client";

import { ContextChip } from "@/components/context-chip";
import { MAX_PICK_TAGS, type SongTag } from "@/lib/tags";

export const MAX_TAGS = MAX_PICK_TAGS;

/**
 * 1–3 tags for one song, from the tags written for that song (getSongTags in lib/api.ts), which
 * the backend validates against. `options` undefined = still loading. Tags already chosen (say, an
 * older pick's fixed tags) always stay visible so they can be kept or removed.
 */
export function TagPicker({
  value,
  onChange,
  label,
  options,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  label: string;
  options: SongTag[] | undefined;
}) {
  const full = value.length >= MAX_TAGS;
  const labels = [...value.filter((v) => !options?.some((o) => o.label === v)), ...(options ?? []).map((o) => o.label)];

  const toggle = (tag: string) => {
    if (value.includes(tag)) onChange(value.filter((t) => t !== tag));
    else if (!full) onChange([...value, tag]);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">What is it for you?</p>
        <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {value.length}/{MAX_TAGS}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={label} aria-busy={!options}>
        {labels.map((tag) => {
          const selected = value.includes(tag);
          return (
            <span key={tag} className={!selected && full ? "opacity-40" : undefined}>
              <ContextChip label={tag} selected={selected} onToggle={() => toggle(tag)} />
            </span>
          );
        })}
        {!options
          ? [96, 128, 84, 112, 100].map((w, i) => (
              <span key={i} className="h-9 animate-pulse rounded-full bg-white/[0.06]" style={{ width: w }} aria-hidden />
            ))
          : null}
      </div>
      {!options ? <p className="sr-only">Loading tags for this song</p> : null}
    </div>
  );
}
