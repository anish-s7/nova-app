"use client";

import { ContextChip } from "@/components/context-chip";
import { CLUSTERS, getCluster } from "@/lib/clusters";
import { MAX_PICK_TAGS, sortFeelings, TAGS } from "@/lib/tags";

export const MAX_TAGS = MAX_PICK_TAGS;

/**
 * 1–3 feelings for one song (lib/tags.ts), in five rows, one per listening reason. Placed after the
 * mood circle: once the dot is placed, the rows and feelings closest to it come first, so the
 * likeliest are at the top and nothing is hidden. Older picks' original tags stay visible so they
 * can be kept or removed.
 */
export function TagPicker({
  value,
  onChange,
  label,
  mood,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  label: string;
  /** The mood circle's dot; sorting only kicks in once it's been placed. */
  mood?: { valence: number; energy: number; placed: boolean };
}) {
  const full = value.length >= MAX_TAGS;
  const groups = sortFeelings(mood?.placed ? mood : null);
  const older = value.filter((t) => !(TAGS as readonly string[]).includes(t));

  const toggle = (tag: string) => {
    if (value.includes(tag)) onChange(value.filter((t) => t !== tag));
    else if (!full) onChange([...value, tag]);
  };

  const chip = (tag: string) => {
    const selected = value.includes(tag);
    return (
      <span key={tag} className={!selected && full ? "opacity-40" : undefined}>
        <ContextChip label={tag} selected={selected} onToggle={() => toggle(tag)} />
      </span>
    );
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">How does it feel?</p>
        <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {value.length}/{MAX_TAGS}
        </p>
      </div>
      <div className="mt-2 flex flex-col gap-3" role="group" aria-label={label}>
        {older.length ? (
          <div>
            <p className="mb-1.5 text-[11px] text-muted-foreground">From before</p>
            <div className="flex flex-wrap gap-2">{older.map(chip)}</div>
          </div>
        ) : null}
        {groups.map((g) => (
          <div key={g.why}>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{CLUSTERS[g.why]?.label ?? getCluster(g.why).label}</p>
            <div className="flex flex-wrap gap-2">{g.feelings.map(chip)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
