/**
 * Whether Supabase Auth is set up in this environment. Without keys, the app
 * runs on mock data with no sign-in so frontend work isn't blocked; with keys,
 * the app requires an account.
 */
export function isSupabaseConfigured() {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
