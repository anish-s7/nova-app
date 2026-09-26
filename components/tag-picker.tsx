"use client";

import { ContextChip } from "@/components/context-chip";
import { TAGS, type Tag } from "@/lib/tags";

export const MAX_TAGS = 3;

/** 1–3 mood tags for one song, from the fixed taxonomy the backend validates against (lib/tags.ts). */
export function TagPicker({ value, onChange, label }: { value: Tag[]; onChange: (tags: Tag[]) => void; label: string }) {
  const full = value.length >= MAX_TAGS;

  const toggle = (tag: Tag) => {
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
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={label}>
        {TAGS.map((tag) => {
          const selected = value.includes(tag);
          return (
            <span key={tag} className={!selected && full ? "opacity-40" : undefined}>
              <ContextChip label={tag} selected={selected} onToggle={() => toggle(tag)} />
            </span>
          );
        })}
      </div>
    </div>
  );
}
