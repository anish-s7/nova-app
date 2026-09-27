import { createServerClient as createSSRClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * Session-aware Supabase client for route handlers. Reads the actual
 * logged-in user from cookies via Supabase Auth. Use this (not the
 * service-role client in server.ts) for anything acting "as the current
 * user" — creating a profile, adding a pick, sending a message.
 */
export async function createSessionClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
    );
  }

  return createSSRClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}

/**
 * Returns the current logged-in user's profile id (== auth.users.id), or
 * null if there's no session. Route handlers should reject with 401 when
 * this comes back null rather than falling back to a trusted body/query
 * param.
 */
export async function getCurrentProfileId(): Promise<string | null> {
  const supabase = await createSessionClient();
  // getClaims() verifies the JWT signature (a forged cookie can't pass). With asymmetric signing
  // keys it checks locally against cached JWKS, skipping getUser()'s Auth-server round trip on
  // every request; with a symmetric secret it falls back to that same server check.
  const { data, error } = await supabase.auth.getClaims();
  if (error) console.error("getCurrentProfileId: session check failed:", error.message);

  return data?.claims.sub ?? null;
}
