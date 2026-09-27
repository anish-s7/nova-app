import type { NextRequest } from "next/server";
import { listeningEnabled } from "@/lib/listening/config";
import { isListeningProvider } from "@/lib/listening/types";
import { mutationAllowed, privateJson } from "@/lib/listening/routes";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

export async function DELETE(request: NextRequest, context: RouteContext<"/api/listening/connections/[provider]">) {
  const profileId = await getCurrentProfileId();
  if (!profileId) return privateJson({ error: "Not authenticated" }, { status: 401 });
  if (!listeningEnabled()) return privateJson({ error: "Listening imports are not enabled" }, { status: 404 });
  if (!mutationAllowed(request)) return privateJson({ error: "Invalid request origin" }, { status: 403 });
  const { provider } = await context.params;
  if (!isListeningProvider(provider)) return privateJson({ error: "Unknown provider" }, { status: 400 });
  const { data, error } = await createServerClient().rpc("disconnect_listening_connection", {
    p_profile_id: profileId,
    p_provider: provider,
  });
  if (error) return privateJson({ error: "Unable to disconnect provider" }, { status: 500 });
  return privateJson({ disconnected: data });
}
