import { isSupabaseConfigured } from "../supabase/config";

/**
 * Real backend vs the mock world. Real whenever Supabase is configured (the app is signed-in only
 * then), unless NEXT_PUBLIC_DATA_SOURCE=mock forces the demo data, e.g. for screenshots or /sim-style
 * offline work. NEXT_PUBLIC_* values are inlined at build time, so this is safe to read on the client.
 */
export const REAL_DATA = isSupabaseConfigured() && process.env.NEXT_PUBLIC_DATA_SOURCE !== "mock";
