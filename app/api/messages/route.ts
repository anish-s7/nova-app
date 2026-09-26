import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// Reads/subscriptions happen client-side via Supabase Realtime directly
// against the `messages` table. This route only handles writes, so we can
// validate/rate-limit server-side if needed later.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userA, userB, senderId, text } = body as {
    userA?: string;
    userB?: string;
    senderId?: string;
    text?: string;
  };

  if (!userA || !userB || !senderId || !text) {
    return NextResponse.json(
      { error: "userA, userB, senderId, and text are required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const [a, b] = userA < userB ? [userA, userB] : [userB, userA];

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
