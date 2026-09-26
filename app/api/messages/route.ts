import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createSessionClient, getCurrentProfileId } from "@/lib/supabase/serverAuth";

/**
 * Reads the signed-in user's messages (all threads, or one with `?with=<profileId>`), oldest first.
 * Uses the session client so RLS ("Participants can view messages") scopes it: no one can read a
 * thread they're not in. Clients poll this until the Realtime subscription lands (backburner #4).
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentProfileId();
  if (!me) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const other = req.nextUrl.searchParams.get("with");
  const supabase = await createSessionClient();
  let query = supabase.from("messages").select("*").order("created_at", { ascending: true });
  if (other) {
    const [a, b] = me < other ? [me, other] : [other, me];
    query = query.eq("user_a", a).eq("user_b", b);
  }

  const { data, error } = await query;
  if (error) {
    console.error("GET /api/messages failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ messages: data ?? [] });
}

// Writes go through here so we can validate/rate-limit server-side later.
export async function POST(req: NextRequest) {
  const senderId = await getCurrentProfileId();
  if (!senderId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { otherProfileId, text } = body as {
    otherProfileId?: string;
    text?: string;
  };

  if (!otherProfileId || !text) {
    return NextResponse.json(
      { error: "otherProfileId and text are required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const [a, b] = senderId < otherProfileId ? [senderId, otherProfileId] : [otherProfileId, senderId];

  const { data, error } = await supabase
    .from("messages")
    .insert({ user_a: a, user_b: b, sender_id: senderId, body: text })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}
