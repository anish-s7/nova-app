"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { LoaderCircle, RefreshCw, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ListeningProvider } from "@/lib/listening/types";

type Job = {
  id: string;
  state: "queued" | "running" | "retry_wait" | "complete" | "failed" | "cancelled";
  events_seen: number;
  events_inserted: number;
  events_deduplicated: number;
  safe_error_code: string | null;
};
type Connection = {
  id: string;
  provider: ListeningProvider;
  canonical_username: string;
  status: "active" | "error" | "disconnected";
  last_successful_query_at: string | null;
  latest_observed_listen_at: string | null;
  safe_error_code: string | null;
  job: Job | null;
};
type ConnectionsResponse = {
  enabled: boolean;
  connections: Connection[];
  preferences: { primary_connection_id: string | null; timezone: string; exploration_setting: string } | null;
};

const providers: { id: ListeningProvider; name: string; hint: string }[] = [
  { id: "lastfm", name: "Last.fm", hint: "Your public Last.fm username" },
  { id: "listenbrainz", name: "ListenBrainz", hint: "Your MusicBrainz username" },
];

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Request failed");
  return response.json() as Promise<T>;
}

async function mutateJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Request failed");
  return result;
}

export function SourceSettings() {
  const capabilities = useSWR<{ listening: boolean }>("/api/capabilities", getJson, { shouldRetryOnError: false });
  if (!capabilities.data?.listening) return null;
  return <EnabledSourceSettings />;
}

function EnabledSourceSettings() {
  const query = useSWR<ConnectionsResponse>("/api/listening/connections", getJson, {
    refreshInterval: (data) => data?.connections.some((connection) => ["queued", "running", "retry_wait"].includes(connection.job?.state ?? "")) ? 4_000 : 0,
  });
  const [username, setUsername] = useState<Record<ListeningProvider, string>>({ lastfm: "", listenbrainz: "" });
  const [consent, setConsent] = useState<Record<ListeningProvider, boolean>>({ lastfm: false, listenbrainz: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byProvider = useMemo(() => new Map(query.data?.connections.map((item) => [item.provider, item])), [query.data]);

  async function act(key: string, operation: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await operation();
      await query.mutate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 px-5" aria-labelledby="listening-sources-heading">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 id="listening-sources-heading" className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Listening sources</h2>
          <p className="mt-1 text-sm text-muted-foreground">Private history for your evolving taste and discoveries.</p>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {providers.map((provider) => {
          const connection = byProvider.get(provider.id);
          const connected = connection?.status === "active";
          const primary = connection?.id === query.data?.preferences?.primary_connection_id;
          const running = ["queued", "running", "retry_wait"].includes(connection?.job?.state ?? "");
          return (
            <div key={provider.id} className="border border-white/10 bg-card/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{provider.name}</h3>
                  {connected ? <p className="mt-0.5 text-xs text-muted-foreground">@{connection.canonical_username} · unverified public profile</p> : <p className="mt-0.5 text-xs text-muted-foreground">{provider.hint}</p>}
                </div>
                {connected ? <span className={cn("text-xs", running ? "text-primary" : "text-emerald-400")}>{running ? "Syncing" : "Connected"}</span> : null}
              </div>
              {connected ? (
                <>
                  {connection.job ? (
                    <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
                      {jobText(connection.job)}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={primary || busy !== null} onClick={() => act(`primary-${provider.id}`, () => mutateJson("/api/listening/preferences", "PATCH", { primaryProvider: provider.id, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", explorationSetting: query.data?.preferences?.exploration_setting ?? "balanced" }))} className="min-h-9 border border-white/10 px-3 text-xs disabled:opacity-50">
                      {primary ? "Primary source" : "Make primary"}
                    </button>
                    <button type="button" disabled={running || busy !== null} onClick={() => act(`sync-${provider.id}`, () => mutateJson("/api/listening/sync", "POST", { provider: provider.id }))} className="inline-flex min-h-9 items-center gap-1.5 border border-white/10 px-3 text-xs disabled:opacity-50">
                      <RefreshCw className={cn("size-3.5", running && "animate-spin")} aria-hidden /> Sync now
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => act(`disconnect-${provider.id}`, () => mutateJson(`/api/listening/connections/${provider.id}`, "DELETE"))} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50">
                      <Unplug className="size-3.5" aria-hidden /> Disconnect and delete
                    </button>
                  </div>
                </>
              ) : (
                <form className="mt-3" onSubmit={(event) => {
                  event.preventDefault();
                  void act(`connect-${provider.id}`, () => mutateJson("/api/listening/connections", "POST", { provider: provider.id, username: username[provider.id], consentAccepted: consent[provider.id] }));
                }}>
                  <label className="sr-only" htmlFor={`${provider.id}-username`}>{provider.name} username</label>
                  <input id={`${provider.id}-username`} value={username[provider.id]} onChange={(event) => setUsername((current) => ({ ...current, [provider.id]: event.target.value }))} maxLength={128} autoCapitalize="none" autoCorrect="off" placeholder="Username" className="h-10 w-full border border-white/10 bg-background px-3 text-sm outline-none focus:border-primary" />
                  <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={consent[provider.id]} onChange={(event) => setConsent((current) => ({ ...current, [provider.id]: event.target.checked }))} className="mt-0.5" />
                    <span>Import up to 90 days of this public history and retain raw listens for 120 days. This does not verify account ownership or make the history public here.</span>
                  </label>
                  <button type="submit" disabled={!username[provider.id].trim() || !consent[provider.id] || busy !== null} className="mt-3 inline-flex min-h-10 items-center gap-2 bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    {busy === `connect-${provider.id}` ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
                    Connect {provider.name}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
      {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
      <p className="mt-3 text-xs text-muted-foreground">No provider password or token is stored. Empty history is valid; interrupted imports resume from their last committed page.</p>
    </section>
  );
}

function jobText(job: Job): string {
  if (job.state === "complete") return `${job.events_inserted} listens imported · ${job.events_deduplicated} already seen`;
  if (job.state === "failed") return `Sync stopped (${job.safe_error_code ?? "provider error"}). You can try again.`;
  if (job.state === "retry_wait") return `Provider asked us to wait · ${job.events_inserted} imported so far`;
  if (job.state === "cancelled") return "Sync cancelled";
  return `${job.events_seen} listens checked · ${job.events_inserted} imported`;
}
