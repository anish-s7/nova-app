import { privateJson } from "@/lib/listening/routes";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/listening/jobs/[id]">) {
  const profileId = await getCurrentProfileId();
  if (!profileId) return privateJson({ error: "Not authenticated" }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await createServerClient().from("listening_sync_jobs")
    .select("id, connection_id, state, kind, pages_fetched, events_seen, events_inserted, events_deduplicated, safe_error_code, created_at, updated_at, completed_at")
    .eq("id", id).eq("profile_id", profileId).maybeSingle();
  if (error) return privateJson({ error: "Unable to load sync job" }, { status: 500 });
  if (!data) return privateJson({ error: "Sync job not found" }, { status: 404 });
  return privateJson({ job: data });
}
