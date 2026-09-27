import { after, type NextRequest } from "next/server";
import { listeningEnabled } from "@/lib/listening/config";
import { isListeningProvider } from "@/lib/listening/types";
import { jsonObject, mutationAllowed, privateJson } from "@/lib/listening/routes";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { recomputeTasteSnapshot } from "@/lib/taste/snapshots";

export async function PATCH(request: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) return privateJson({ error: "Not authenticated" }, { status: 401 });
  if (!listeningEnabled()) return privateJson({ error: "Listening imports are not enabled" }, { status: 404 });
  if (!mutationAllowed(request)) return privateJson({ error: "Invalid request origin" }, { status: 403 });
  const body = await jsonObject(request);
  const provider = body?.primaryProvider;
  const timezone = typeof body?.timezone === "string" ? body.timezone : "UTC";
  const exploration = typeof body?.explorationSetting === "string" ? body.explorationSetting : "balanced";
  if (provider !== null && !isListeningProvider(provider)) return privateJson({ error: "Invalid primary provider" }, { status: 400 });
  if (!['close', 'balanced', 'explore'].includes(exploration) || timezone.length > 80) return privateJson({ error: "Invalid preferences" }, { status: 400 });
  const supabase = createServerClient();
  let connectionId: string | null = null;
  if (provider) {
    const { data } = await supabase.from("listening_connections").select("id").eq("profile_id", profileId).eq("provider", provider).eq("status", "active").maybeSingle();
    if (!data) return privateJson({ error: "Connect that provider first" }, { status: 400 });
    connectionId = data.id;
  }
  const { error } = await supabase.rpc("set_listening_preferences", {
    p_profile_id: profileId,
    p_primary_connection_id: connectionId,
    p_timezone: timezone,
    p_exploration_setting: exploration,
  });
  if (error) return privateJson({ error: error.message.includes("timezone") ? "Invalid timezone" : "Unable to update preferences" }, { status: 400 });
  if (connectionId) {
    after(async () => {
      try {
        await recomputeTasteSnapshot({ client: supabase, profileId, connectionId });
      } catch (tasteError) {
        console.error("Taste recomputation after preference change failed", tasteError);
      }
    });
  }
  return privateJson({ updated: true });
}
