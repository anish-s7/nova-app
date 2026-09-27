import type { NextRequest } from "next/server";
import { discoveryEnabled } from "@/lib/listening/config";
import { jsonObject, mutationAllowed, privateJson } from "@/lib/listening/routes";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

const ACTIONS = new Set(["impression", "preview_start", "outbound_click", "save", "dismiss", "not_now", "more_like", "hide_artist"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) return privateJson({ error: "Not authenticated" }, { status: 401 });
  if (!discoveryEnabled()) return privateJson({ error: "Discovery is not enabled" }, { status: 404 });
  if (!mutationAllowed(request)) return privateJson({ error: "Invalid request origin" }, { status: 403 });
  const body = await jsonObject(request);
  const candidateId = typeof body?.candidateId === "string" ? body.candidateId : "";
  const action = typeof body?.action === "string" ? body.action : "";
  const clientIdempotencyKey = typeof body?.clientIdempotencyKey === "string" ? body.clientIdempotencyKey : "";
  if (!UUID.test(candidateId) || !ACTIONS.has(action) || clientIdempotencyKey.length < 8 || clientIdempotencyKey.length > 100) {
    return privateJson({ error: "Invalid discovery feedback" }, { status: 400 });
  }
  const { data: feedbackRevision, error } = await createServerClient().rpc("record_discovery_feedback", {
    p_profile_id: profileId,
    p_candidate_id: candidateId,
    p_action: action,
    p_client_idempotency_key: clientIdempotencyKey,
  });
  if (error) return privateJson({ error: error.code === "42501" ? "Candidate not found" : "Unable to save feedback" }, { status: error.code === "42501" ? 404 : 500 });
  return privateJson({ feedbackRevision, saved: action === "save" });
}
