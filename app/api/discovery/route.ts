import type { NextRequest } from "next/server";
import { getOrCreateDiscovery } from "@/lib/discovery/service";
import type { DiscoveryMode } from "@/lib/discovery/types";
import { discoveryEnabled, listeningEnabled } from "@/lib/listening/config";
import { privateJson } from "@/lib/listening/routes";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) return privateJson({ error: "Not authenticated" }, { status: 401 });
  if (!listeningEnabled() || !discoveryEnabled()) return privateJson({ error: "Discovery is not enabled" }, { status: 404 });
  const mode = request.nextUrl.searchParams.get("mode") ?? "close";
  const anchorSongId = request.nextUrl.searchParams.get("anchorSongId") ?? undefined;
  if (mode !== "close" && mode !== "explore") return privateJson({ error: "Invalid discovery mode" }, { status: 400 });
  if (anchorSongId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(anchorSongId)) {
    return privateJson({ error: "Invalid anchor song" }, { status: 400 });
  }
  try {
    return privateJson(await getOrCreateDiscovery({
      client: createServerClient(), profileId, mode: mode as DiscoveryMode, anchorSongId,
    }));
  } catch (error) {
    console.error("GET /api/discovery failed", error);
    const cause = error instanceof Error && error.cause && typeof error.cause === "object" ? error.cause as { code?: string } : null;
    return privateJson({ error: cause?.code === "42501" ? "That anchor is not available" : "Discoveries are unavailable right now" }, { status: cause?.code === "42501" ? 403 : 500 });
  }
}
