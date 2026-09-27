/**
 * Deletes every test user made by scripts/seed-test-users.ts (emails ending in
 * @test.song-galaxy.local), with their picks, portraits, cards and messages (cascade). Never
 * touches the demo personas (@song-galaxy.local) or real accounts. Catalog songs stay.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/remove-test-users.ts          # dry run
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/remove-test-users.ts --apply
 */
import { createServerClient } from "../lib/supabase/server";

const DOMAIN = "@test.song-galaxy.local";

async function main() {
  const supabase = createServerClient();
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  const tests = users.filter((u) => u.email?.toLowerCase().endsWith(DOMAIN));
  if (!process.argv.includes("--apply")) {
    console.log(`${tests.length} test users would be deleted (dry run). Add --apply to delete.`);
    return;
  }
  let deleted = 0;
  for (const u of tests) {
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    if (error) console.error(`  ${u.email}: ${error.message}`);
    else deleted++;
  }
  console.log(`Deleted ${deleted}/${tests.length} test users.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
