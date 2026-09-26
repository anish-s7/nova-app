import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center motion-safe:animate-in motion-safe:fade-in">
      <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-card ring-1 ring-white/10">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-64 text-pretty text-sm leading-relaxed text-muted-foreground">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
