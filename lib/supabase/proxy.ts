import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

/**
 * Refreshes the Supabase session cookie on every request and returns the
 * signed-in user (or null). Any response built from this must carry over the
 * cookies set here, or the refreshed session is lost.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // getClaims() refreshes an expiring session and verifies the JWT signature, so a forged cookie
  // can't pass. With asymmetric signing keys it's a local check (cached JWKS) instead of getUser()'s
  // round trip to Supabase Auth on every request, API calls included.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims.sub ? { id: data.claims.sub } : null;

  return { response, user };
}

/** Redirect that keeps any session cookies the refresh just set. */
export function redirectWithSession(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
