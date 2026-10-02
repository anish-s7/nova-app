import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { isMissingColumn } from "@/lib/supabase/missing-table";
import { sanitizeFace, type AvatarInfo } from "@/lib/avatar/avatar";

const MAX_IDS = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Profile icons for up to 200 people: GET /api/avatar?ids=<id>,<id>,me. Every requested id comes back
 * (face and photo null when they haven't set one), so the client doesn't ask again. Icons are shown
 * to everyone, like display names. Until migration 20260930000000 is applied, everyone gets the
 * default (their generated face).
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentProfileId();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const requested = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, MAX_IDS);
  const ids = [...new Set(requested.map((id) => (id === "me" ? me : id)).filter((id) => UUID.test(id)))];
  const avatars: Record<string, AvatarInfo> = {};
  for (const id of requested) avatars[id] = { face: null, photoUrl: null };
  if (ids.length === 0) return NextResponse.json({ avatars });

  const { data, error } = await createServerClient().from("profiles").select("id, avatar, avatar_url").in("id", ids);
  if (isMissingColumn(error)) return NextResponse.json({ avatars });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const row of data ?? []) {
    const info = { face: sanitizeFace(row.avatar), photoUrl: row.avatar_url };
    avatars[row.id] = info;
    if (row.id === me && requested.includes("me")) avatars.me = info;
  }
  return NextResponse.json({ avatars });
}

/** Saves my illustrated face: PATCH { face }, or { face: null } to go back to the one generated from my name. */
export async function PATCH(req: NextRequest) {
  const me = await getCurrentProfileId();
  if (!me) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { face?: unknown } | null;
  if (!body || !("face" in body)) return NextResponse.json({ error: "face is required" }, { status: 400 });
  const face = body.face === null ? null : sanitizeFace(body.face);
  if (body.face !== null && !face) return NextResponse.json({ error: "That face has options we don't know" }, { status: 400 });

  // Service role: `authenticated` may only update display_name, and the face was validated above.
  const { error } = await createServerClient().from("profiles").update({ avatar: face }).eq("id", me);
  if (isMissingColumn(error)) return NextResponse.json({ error: "Profile icons aren't set up on the server yet." }, { status: 503 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ face });
}
