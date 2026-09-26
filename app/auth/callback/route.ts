import { NextResponse, type NextRequest } from "next/server";
import { createSessionClient } from "@/lib/supabase/serverAuth";

/**
 * Where Google/Apple (and email confirmation links) land after Supabase finishes
 * the OAuth handshake. Trades the one-time `code` for a session cookie, then
 * sends the user on to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  const failed = new URL("/login", origin);
  failed.searchParams.set("error", searchParams.get("error_description") ?? "Sign-in didn't complete. Please try again.");
  return NextResponse.redirect(failed);
}

/** Only allow same-site paths, so the callback can't be used as an open redirect. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/galaxy";
}
