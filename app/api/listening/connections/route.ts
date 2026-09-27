import { after, type NextRequest } from "next/server";
import { createListeningAdapters } from "@/lib/listening/adapters";
import { LISTENING_CONSENT_VERSION, listeningEnabled } from "@/lib/listening/config";
import { isListeningProvider } from "@/lib/listening/types";
import { jsonObject, mutationAllowed, privateJson } from "@/lib/listening/routes";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { createSupabaseWorker } from "@/lib/listening/worker";

export const dynamic = "force-dynamic";

export async function GET() {
  const profileId = await getCurrentProfileId();
  if (!profileId) return privateJson({ error: "Not authenticated" }, { status: 401 });
  if (!listeningEnabled()) return privateJson({ enabled: false, connections: [], preferences: null });
  const supabase = createServerClient();
  const [{ data: connections, error }, { data: preferences }] = await Promise.all([
    supabase.from("listening_connections")
      .select("id, provider, canonical_username, verification_state, status, consented_at, last_successful_query_at, latest_observed_listen_at, safe_error_code")
      .eq("profile_id", profileId)
      .order("provider"),
    supabase.from("listening_preferences")
      .select("primary_connection_id, timezone, exploration_setting")
      .eq("profile_id", profileId)
      .maybeSingle(),
  ]);
  if (error) return privateJson({ error: "Unable to load listening connections" }, { status: 500 });
  const ids = (connections ?? []).map((connection) => connection.id);
  const { data: jobs } = ids.length
    ? await supabase.from("listening_sync_jobs")
      .select("id, connection_id, state, kind, pages_fetched, events_seen, events_inserted, events_deduplicated, safe_error_code, created_at, updated_at, completed_at")
      .in("connection_id", ids)
      .order("created_at", { ascending: false })
    : { data: [] };
  const latestJob = new Map<string, NonNullable<typeof jobs>[number]>();
  for (const job of jobs ?? []) if (!latestJob.has(job.connection_id)) latestJob.set(job.connection_id, job);
  return privateJson({
    enabled: true,
    connections: (connections ?? []).map((connection) => ({ ...connection, job: latestJob.get(connection.id) ?? null })),
    preferences,
  });
}

export async function POST(request: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) return privateJson({ error: "Not authenticated" }, { status: 401 });
  if (!listeningEnabled()) return privateJson({ error: "Listening imports are not enabled" }, { status: 404 });
  if (!mutationAllowed(request)) return privateJson({ error: "Invalid request origin" }, { status: 403 });
  const body = await jsonObject(request);
  const provider = body?.provider;
  const username = typeof body?.username === "string" ? body.username : "";
  if (!isListeningProvider(provider) || !username || body?.consentAccepted !== true) {
    return privateJson({ error: "provider, username, and consent are required" }, { status: 400 });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  let canonicalUsername: string;
  try {
    canonicalUsername = await createListeningAdapters()[provider].validateUsername(username, controller.signal);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "provider_unavailable";
    const status = code === "invalid_username" ? 400 : 502;
    return privateJson({ error: code === "invalid_username" ? "That username was not found" : "The provider could not validate that username", code }, { status });
  } finally {
    clearTimeout(timer);
  }
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc("configure_listening_connection", {
    p_profile_id: profileId,
    p_provider: provider,
    p_canonical_username: canonicalUsername,
    p_consent_version: LISTENING_CONSENT_VERSION,
    p_now: new Date().toISOString(),
  });
  if (error || !data?.[0]) return privateJson({ error: "Unable to save listening connection" }, { status: 500 });
  const row = data[0];
  const run = createSupabaseWorker({ client: supabase, adapters: createListeningAdapters() });
  after(async () => { try { await run(); } catch (workerError) { console.error("Listening worker kick failed", workerError); } });
  return privateJson({ connectionId: row.connection_id, jobId: row.job_id, canonicalUsername }, { status: 202 });
}
