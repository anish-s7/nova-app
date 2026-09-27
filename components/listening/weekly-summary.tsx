"use client";

import useSWR from "swr";
import { ArrowDownRight, ArrowUpRight, Minus, Radio, Sparkles } from "lucide-react";

type Summary = {
  status: "no_source" | "syncing" | "pending" | "empty" | "refreshing" | "ready";
  primarySource?: { provider: "lastfm" | "listenbrainz"; username: string; verified: false };
  snapshot: null | {
    id: string; asOf: string; coverageStart: string | null; coverageEnd: string | null;
    coverageState: "empty" | "short" | "established"; totalPlays: number;
    distinctTracks: number; distinctArtists: number; observedDays: number;
    recent7Plays: number; previous7Plays: number; weeklyDirection: "new" | "up" | "steady" | "down" | "quiet"; stale: boolean;
  };
  interests: { key: string; label: string; recentWeight: number; coreWeight: number; confidence: number; evidenceDays: number; direction: "rising" | "steady" | "cooling" }[];
  recentTracks?: { trackId: string; title: string; artistCredit: string }[];
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Request failed");
  return response.json() as Promise<T>;
}

export function WeeklySummary() {
  const capabilities = useSWR<{ listening: boolean }>("/api/capabilities", getJson, { shouldRetryOnError: false });
  const summary = useSWR<Summary>(capabilities.data?.listening ? "/api/listening/summary" : null, getJson, { refreshInterval: 15_000 });
  if (!capabilities.data?.listening || !summary.data || summary.data.status === "no_source") return null;
  const data = summary.data;
  return (
    <section className="mt-8 px-5" aria-labelledby="weekly-listening-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="weekly-listening-heading" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Your listening now</h2>
          <p className="mt-1 text-xs text-muted-foreground">Private · {providerName(data.primarySource?.provider)} is your primary source</p>
        </div>
        {data.snapshot ? <Direction value={data.snapshot.weeklyDirection} /> : <Radio className="size-4 animate-pulse text-primary" aria-hidden />}
      </div>
      {!data.snapshot ? (
        <div className="mt-3 border border-white/10 bg-card/40 p-4 text-sm text-muted-foreground" aria-live="polite">
          {data.status === "syncing" ? "Importing your recent history. This can resume if interrupted." : "Your history is ready; the first taste summary is being prepared."}
        </div>
      ) : data.status === "empty" ? (
        <div className="mt-3 border border-white/10 bg-card/40 p-4">
          <p className="font-medium">No recorded listens yet</p>
          <p className="mt-1 text-sm text-muted-foreground">The source synced successfully, but it returned no history in the selected window.</p>
        </div>
      ) : (
        <div className="mt-3 border border-white/10 bg-card/40 p-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{data.snapshot.recent7Plays}</p>
              <p className="text-xs text-muted-foreground">recorded plays in the last 7 days</p>
            </div>
            <p className="text-right text-xs text-muted-foreground">{data.snapshot.distinctArtists} artists<br />{data.snapshot.distinctTracks} tracks</p>
          </div>
          {data.snapshot.coverageState === "short" ? <p className="mt-3 border-l-2 border-amber-300/70 pl-2 text-xs text-muted-foreground">Early read from {data.snapshot.observedDays} observed day{data.snapshot.observedDays === 1 ? "" : "s"}; this will settle as more history arrives.</p> : null}
          {data.snapshot.stale ? <p className="mt-3 text-xs text-primary">New history is being folded into this summary.</p> : null}
          {data.interests.length ? (
            <div className="mt-4">
              <h3 className="text-xs font-medium text-muted-foreground">Artist-led interests</h3>
              <ul className="mt-2 space-y-2">
                {data.interests.slice(0, 5).map((interest) => (
                  <li key={interest.key} className="flex items-center gap-3">
                    <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm">{interest.label}</span>
                    <span className="text-[11px] text-muted-foreground">{interest.direction}</span>
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10" aria-label={`${Math.round(interest.recentWeight * 100)} percent of recent affinity`}>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.round(interest.recentWeight * 100))}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {data.recentTracks?.length ? <p className="mt-4 text-xs text-muted-foreground">Recent signals: {data.recentTracks.slice(0, 3).map((track) => track.title).join(" · ")}</p> : null}
          <p className="mt-4 text-[11px] text-muted-foreground">As of {new Date(data.snapshot.asOf).toLocaleString()} · listening evidence, separate from your authored meanings</p>
        </div>
      )}
    </section>
  );
}

function providerName(provider: "lastfm" | "listenbrainz" | undefined) {
  return provider === "lastfm" ? "Last.fm" : provider === "listenbrainz" ? "ListenBrainz" : "Your source";
}

function Direction({ value }: { value: NonNullable<Summary["snapshot"]>["weeklyDirection"] }) {
  if (value === "up" || value === "new") return <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><ArrowUpRight className="size-3.5" aria-hidden />More active</span>;
  if (value === "down") return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ArrowDownRight className="size-3.5" aria-hidden />Quieter</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="size-3.5" aria-hidden />{value === "quiet" ? "Quiet week" : "Steady"}</span>;
}
