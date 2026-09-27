"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { EvidenceLine } from "@/components/evidence-line";
import { ThemeTag } from "@/components/theme-tag";
import { Switch } from "@/components/ui/switch";
import { updateMotivation } from "@/lib/api";
import { burst } from "@/lib/burst";
import { getCluster } from "@/lib/clusters";
import type { InferredMotivation, Song } from "@/lib/types";
import { cn } from "@/lib/utils";

/** `inline`: rendered inside a list row that already shows the reason's name (Profile), so skip the card chrome and heading. */
export function MotivationCard({ motivation: m, songs, className, inline = false }: { motivation: InferredMotivation; songs: Song[]; className?: string; inline?: boolean }) {
  const id = useId();
  const [note, setNote] = useState(m.note ?? "");
  const ref = useRef<HTMLElement>(null);
  const tone = { "--tone": getCluster(m.cluster).color } as CSSProperties;

  if (m.feedback === "rejected") {
    return (
      <article style={tone} className={cn("flex min-h-14 items-center gap-3", inline ? "px-4 pb-3" : "rounded-2xl border border-dashed border-white/10 px-4 py-2", className)}>
        <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          <span className="line-through decoration-white/30">{m.label}</span> · left out
        </p>
        <button
          type="button"
          onClick={() => updateMotivation(m.id, { feedback: "unreviewed" })}
          className={cn("-mr-2 inline-flex min-h-11 items-center gap-1.5 px-3 text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground", !inline && "rounded-full")}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Undo
        </button>
      </article>
    );
  }

  const confirmed = m.feedback === "confirmed";

  return (
    <article
      ref={ref}
      style={tone}
      aria-labelledby={`${id}-label`}
      className={cn(
        inline ? "relative px-4 pb-4" : "surface relative rounded-3xl border bg-card/70 p-5 transition-colors",
        !inline && (confirmed ? "border-[color-mix(in_oklch,var(--tone)_40%,transparent)]" : "border-white/10"),
        className,
      )}
    >
      {inline ? null : (
        <div className="flex items-center justify-between gap-3">
          <ThemeTag cluster={m.cluster} size="sm" short />
          <span className="text-xs tabular-nums text-muted-foreground">{Math.round(m.confidence * 100)}% sure</span>
        </div>
      )}
      <h3 id={`${id}-label`} className={inline ? "sr-only" : "mt-3 text-xl font-semibold leading-tight"}>
        {m.label}
      </h3>
      <p className={cn(inline ? "" : "mt-1.5", "text-pretty text-[17px] leading-snug text-foreground/85")}>{m.description}</p>

      <ul className="mt-4 flex flex-col gap-3 border-t border-white/5 pt-4" aria-label="Why we think so">
        {m.evidence.slice(0, 2).map((e, i) => (
          <EvidenceLine key={i} evidence={e} songs={songs} />
        ))}
      </ul>

      {confirmed ? (
        <div className="mt-5 flex flex-col gap-4 border-t border-white/5 pt-4">
          <div className="flex items-center justify-between">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--tone)]">
              <Check className="size-4" aria-hidden />
              That&apos;s you
            </p>
            <button type="button" onClick={() => updateMotivation(m.id, { feedback: "unreviewed" })} className="min-h-11 px-2 text-sm text-muted-foreground hover:text-foreground">
              Change
            </button>
          </div>

          <div>
            <label htmlFor={`${id}-note`} className="sr-only">
              Note (optional)
            </label>
            <textarea
              id={`${id}-note`}
              rows={2}
              maxLength={140}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => note !== (m.note ?? "") && updateMotivation(m.id, { note: note.trim() || undefined })}
              placeholder="Add a note (optional)"
              className={cn("w-full resize-none border border-white/10 bg-background/60 px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground focus:border-[var(--tone)]", !inline && "rounded-xl")}
            />
          </div>

          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor={`${id}-public`} className="text-sm font-medium">
                Show on Connection Cards
              </label>
              <p id={`${id}-public-help`} className="mt-0.5 text-xs text-muted-foreground">
                Matches see this reason, its songs and your note.
              </p>
            </div>
            <Switch id={`${id}-public`} aria-describedby={`${id}-public-help`} checked={m.isPublic} onCheckedChange={(v) => updateMotivation(m.id, { isPublic: v })} className="mt-0.5" />
          </div>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={(e) => {
              const host = ref.current;
              if (host) {
                const a = host.getBoundingClientRect();
                const b = e.currentTarget.getBoundingClientRect();
                burst(host, b.left - a.left + b.width / 2, b.top - a.top + b.height / 2, getCluster(m.cluster).color);
              }
              updateMotivation(m.id, { feedback: "confirmed" });
            }}
            className={cn("inline-flex min-h-12 items-center justify-center gap-1.5 bg-[color-mix(in_oklch,var(--tone)_20%,transparent)] font-medium text-[var(--tone)] transition-colors hover:bg-[color-mix(in_oklch,var(--tone)_28%,transparent)]", !inline && "rounded-full")}
          >
            <Check className="size-4" aria-hidden />
            That&apos;s me
          </button>
          <button
            type="button"
            onClick={() => updateMotivation(m.id, { feedback: "rejected" })}
            className={cn("inline-flex min-h-12 items-center justify-center gap-1.5 border border-white/10 font-medium text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground", !inline && "rounded-full")}
          >
            <X className="size-4" aria-hidden />
            Not quite
          </button>
        </div>
      )}
    </article>
  );
}
