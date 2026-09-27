import { after, type NextRequest } from "next/server";
import { createListeningAdapters } from "@/lib/listening/adapters";
import { listeningEnabled } from "@/lib/listening/config";
import { isListeningProvider } from "@/lib/listening/types";
import { createSupabaseWorker } from "@/lib/listening/worker";
import { jsonObject, mutationAllowed, privateJson } from "@/lib/listening/routes";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

export async function POST(request: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) return privateJson({ error: "Not authenticated" }, { status: 401 });
  if (!listeningEnabled()) return privateJson({ error: "Listening imports are not enabled" }, { status: 404 });
  if (!mutationAllowed(request)) return privateJson({ error: "Invalid request origin" }, { status: 403 });
  const body = await jsonObject(request);
  if (!isListeningProvider(body?.provider)) return privateJson({ error: "provider is required" }, { status: 400 });
  const supabase = createServerClient();
  const { data: connection } = await supabase.from("listening_connections").select("id").eq("profile_id", profileId).eq("provider", body.provider).eq("status", "active").maybeSingle();
  if (!connection) return privateJson({ error: "Provider is not connected" }, { status: 404 });
  const { data: jobId, error } = await supabase.rpc("enqueue_listening_sync", {
    p_profile_id: profileId,
    p_connection_id: connection.id,
    p_now: new Date().toISOString(),
  });
  if (error) return privateJson({ error: "Unable to queue sync" }, { status: 500 });
  const run = createSupabaseWorker({ client: supabase, adapters: createListeningAdapters() });
  after(async () => { try { await run(); } catch (workerError) { console.error("Listening worker kick failed", workerError); } });
  return privateJson({ jobId }, { status: 202 });
}
