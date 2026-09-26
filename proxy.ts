import type { NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { redirectWithSession, updateSession } from "@/lib/supabase/proxy";

/** Screens that need an account. The welcome page, auth pages and prototypes stay public. */
const PROTECTED = ["/onboarding", "/galaxy", "/connections", "/messages", "/me", "/people"];
/** Pages a signed-in user has no reason to see. */
const AUTH_PAGES = ["/login", "/signup"];

const matches = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    // A deployment must never fall back to the open, no-sign-in demo because a key is missing.
    if (process.env.VERCEL) return new Response("Song Galaxy isn't configured: missing Supabase keys.", { status: 503 });
    // Local, no Supabase keys yet: run the mock app without sign-in (see AUTH_SETUP.md).
    return;
  }

  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!user && matches(pathname, PROTECTED)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return redirectWithSession(url, response);
  }

  if (user && matches(pathname, AUTH_PAGES)) {
    return redirectWithSession(new URL("/galaxy", request.url), response);
  }

  return response;
}

export const config = {
  // Everything except static assets and images. API routes are included so their
  // session cookie stays fresh; they enforce auth themselves via serverAuth.ts.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|covers/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
