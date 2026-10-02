import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createSessionClient } from "@/lib/supabase/serverAuth";
import { safeNextPath } from "@/lib/auth/safe-next";

/**
 * Where Google sign-in (and email confirmation links) land after Supabase finishes
 * the OAuth handshake. Trades the one-time `code` for a session cookie, then
 * sends the user on to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  // Signup's confirmation email sets via=email; OAuth doesn't.
  const fromEmail = searchParams.get("via") === "email";

  if (code) {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (!fromEmail) return NextResponse.redirect(new URL(await oauthDestination(data.user?.id, next), origin));
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

/**
 * Google sign-in doesn't know whether it's a first visit: "Continue with Google" on the login page
 * can create a brand-new account. Someone with no songs yet goes to onboarding instead of an
 * empty galaxy; everyone else goes where they were headed.
 */
async function oauthDestination(userId: string | undefined, next: string): Promise<string> {
  if (!userId || next.startsWith("/onboarding")) return next;
  const { count, error } = await createServerClient().from("song_picks").select("id", { count: "exact", head: true }).eq("profile_id", userId);
  if (error) {
    console.error("auth callback: couldn't check for songs, sending on to next:", error.message);
    return next;
  }
  return count ? next : "/onboarding/pick";
}
