"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Supabase client for client components: sign up, sign in, OAuth redirects,
 * sign out. Sessions live in cookies, so route handlers see the same user
 * through lib/supabase/serverAuth.ts.
 */
export function createClient() {
  return createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
