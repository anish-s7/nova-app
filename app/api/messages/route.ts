import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/supabase/serverAuth";

// Reads/subscriptions happen client-side via Supabase Realtime directly
// against the `messages` table. This route only handles writes, so we can
// validate/rate-limit server-side if needed later.
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
