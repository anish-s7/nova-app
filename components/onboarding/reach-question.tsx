"use client";

import { useId } from "react";
import { setSession, useSession } from "@/lib/data/session";

/** An optional, in-your-own-words answer that sits beside what we inferred. */
export function ReachQuestion({ className }: { className?: string }) {
  const id = useId();
  const { reach = "" } = useSession();
  return (
    <section className={className} aria-labelledby={`${id}-q`}>
      <h2 id={`${id}-q`} className="text-base font-medium leading-snug">
        What do you reach for when you can&apos;t decide what to play?
      </h2>
      <textarea
        value={reach}
        onChange={(e) => setSession({ reach: e.target.value.slice(0, 140) })}
        rows={2}
        maxLength={140}
        placeholder="Optional. Usually the same three Fleetwood Mac songs…"
        aria-labelledby={`${id}-q`}
        className="mt-3 w-full resize-none border border-white/10 bg-background/60 px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground focus:border-primary"
      />
    </section>
  );
}
