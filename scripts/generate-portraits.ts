/**
 * Generates a listening portrait (profile_portraits) for every profile with public picks. Run once
 * after applying migration 20260927030000, and again any time the portrait prompt changes (--force):
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/generate-portraits.ts [--force]
 *
 * Without --force, profiles whose stored portrait already covers their current picks are skipped.
 * Paced for the Gemini free tier (15 requests/minute).
 */
import { createServerClient } from "../lib/supabase/server";
import { upsertPortrait } from "../lib/matching/portraits";

const MIN_GEMINI_INTERVAL_MS = 4500;
const force = process.argv.includes("--force");

async function main() {
  const supabase = createServerClient();
  const { data: profiles, error } = await supabase.from("profiles").select("id, display_name").order("created_at");
  if (error) throw new Error(`Failed to load profiles: ${error.message}`);

  let written = 0;
  let failed = 0;
  for (const p of profiles ?? []) {
    const started = Date.now();
    try {
      const portrait = await upsertPortrait(supabase, p.id, { force });
      console.log(`${p.display_name}: ${portrait?.headline ?? "(no public picks, skipped)"}`);
      if (portrait) written++;
    } catch (err) {
      failed++;
      console.error(`${p.display_name}: failed —`, err instanceof Error ? err.message : err);
    }
    const wait = MIN_GEMINI_INTERVAL_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  console.log(`\nDone: ${written} portraits, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
