import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { discoveryEnabled, listeningEnabled } from "@/lib/listening/config";
import { privateJson } from "@/lib/listening/routes";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getCurrentProfileId())) return privateJson({ error: "Not authenticated" }, { status: 401 });
  return privateJson({ listening: listeningEnabled(), discovery: discoveryEnabled() });
}
