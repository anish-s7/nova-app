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
  // Signup's confirmation email sets via=email; OAuth doesn't.
  const fromEmail = searchParams.get("via") === "email";

  if (code) {
    const supabase = await createSessionClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (!fromEmail) return NextResponse.redirect(new URL(next, origin));
      // Email links open a new tab; let /auth/confirmed hand off to the tab that's waiting.
      const confirmed = new URL("/auth/confirmed", origin);
      confirmed.searchParams.set("next", next);
      return NextResponse.redirect(confirmed);
    }
    // Supabase confirms the email before redirecting here, so a failed exchange on an
    // email link usually means it was opened in a different browser. The account is fine.
    if (fromEmail && !searchParams.get("error_description")) {
      const login = new URL("/login", origin);
      login.searchParams.set("notice", "Your email is confirmed. Log in to continue.");
      return NextResponse.redirect(login);
    }
  }

  const failed = new URL("/login", origin);
  failed.searchParams.set("error", searchParams.get("error_description") ?? "Sign-in didn't complete. Please try again.");
  return NextResponse.redirect(failed);
}

/** Only allow same-site paths, so the callback can't be used as an open redirect. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/galaxy";
}
