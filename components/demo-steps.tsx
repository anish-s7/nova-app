import { cn } from "@/lib/utils";

/** Presenter-only step indicator. Rendered only in demo mode. */
export function DemoSteps({ total, current, className }: { total: number; current: number; className?: string }) {
  return (
    <div className={cn("pointer-events-none flex items-center gap-2 text-[11px] text-muted-foreground/80", className)} aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-1 rounded-full transition-all", i <= current ? "w-3 bg-primary/80" : "w-1 bg-white/20")} />
        ))}
      </span>
      <span>
        {Math.min(current + 1, total)}/{total} · tap to continue
      </span>
    </div>
  );
}
