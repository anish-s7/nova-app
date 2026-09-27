/**
 * Re-assesses every candidate pair with the current connection assessment
 * (lib/gemini/assessConnection.ts) and writes the confirmed cards. Run after changing how
 * connections are judged or scored, so existing cards don't keep the old verdicts:
 *
 *   1. In the SQL Editor (the service role can't DELETE), clear the old match cards:
 *        delete from public.connection_cards where card_json->>'kind' is distinct from 'contrast';
 *   2. node --env-file=.env.local node_modules/.bin/tsx scripts/reassess-connections.ts
 *
 * Candidates are exactly what GET /api/match would consider (match_picks, same limit), each
 * unordered pair assessed once. Existing match cards, and pairs the last run dropped (remembered in
 * scripts/.reassess-state.json, gitignored), are skipped unless --force, so a re-run only retries
 * real failures (e.g. a quota error). Lightly paced (~1 call/second; paid-tier key).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServerClient } from "../lib/supabase/server";
import { assessConnection } from "../lib/gemini/assessConnection";
import { alignCardEvidence } from "../lib/matching/alignCardEvidence";
import { getPortraits, loadPublicPicks, upsertPortrait } from "../lib/matching/portraits";

const MATCH_COUNT = 10; // findMatches' default candidate limit
const MIN_GEMINI_INTERVAL_MS = 1000;
const force = process.argv.includes("--force");

const STATE_FILE = join(__dirname, ".reassess-state.json");

/** Pairs judged "not a match" by an earlier run, keyed "<smaller id>:<larger id>". */
function loadDropped(): Set<string> {
  if (force || !existsSync(STATE_FILE)) return new Set();
  try {
    return new Set((JSON.parse(readFileSync(STATE_FILE, "utf8")) as { dropped?: string[] }).dropped ?? []);
  } catch (err) {
    console.error(`Couldn't read ${STATE_FILE}, re-checking every pair:`, err);
    return new Set();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const orderedPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

async function main() {
  const supabase = createServerClient();

  const { data: profiles, error } = await supabase.from("profiles").select("id, display_name").order("created_at");
  if (error) throw new Error(`Failed to load profiles: ${error.message}`);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const picksOf = await loadPublicPicks(supabase, [...nameOf.keys()]);
  const withPicks = [...nameOf.keys()].filter((id) => (picksOf.get(id) ?? []).length > 0);
  console.log(`${withPicks.length} profiles with public picks`);

  // Portraits feed the assessment; bring any stale ones up to date first (skips current ones).
  let lastCall = 0;
  for (const id of withPicks) {
    await sleep(Math.max(0, MIN_GEMINI_INTERVAL_MS - (Date.now() - lastCall)));
    lastCall = Date.now();
    try {
      await upsertPortrait(supabase, id);
    } catch (err) {
      console.error(`portrait for ${nameOf.get(id)} failed, assessing without it:`, err instanceof Error ? err.message : err);
    }
  }
  const portraitOf = await getPortraits(supabase, withPicks);

  // Every unordered candidate pair, with the closest pick pair as a hint.
  const pairs = new Map<string, { a: string; b: string; pickA: string; pickB: string }>();
  for (const id of withPicks) {
    const { data: candidates, error: rpcError } = await supabase.rpc("match_picks", { target_profile_id: id, match_count: MATCH_COUNT });
    if (rpcError) throw new Error(`match_picks failed for ${nameOf.get(id)}: ${rpcError.message}`);
    for (const c of candidates ?? []) {
      if (!withPicks.includes(c.profile_id)) continue;
      const key = orderedPair(id, c.profile_id).join(":");
      if (!pairs.has(key)) pairs.set(key, { a: id, b: c.profile_id, pickA: c.target_pick_id, pickB: c.song_pick_id });
    }
  }

  const { data: existing } = await supabase.from("connection_cards").select("user_a, user_b, card_json");
  const haveCard = new Set((existing ?? []).filter((c) => c.card_json.kind !== "contrast").map((c) => `${c.user_a}:${c.user_b}`));
  const dropped = loadDropped();
  const todo = [...pairs].filter(([key]) => force || (!haveCard.has(key) && !dropped.has(key)));
  console.log(`${pairs.size} candidate pairs (${haveCard.size} with cards, ${dropped.size} dropped before), ${todo.length} to assess (~${Math.ceil((todo.length * Math.max(MIN_GEMINI_INTERVAL_MS, 3000)) / 60000)} min; each call takes ~3s)\n`);

  const pickIds = [...new Set(todo.flatMap(([, p]) => [p.pickA, p.pickB]))];
  const { data: hintRows } = await supabase.from("song_picks").select("id, songs(title)").in("id", pickIds);
  const titleOf = new Map(((hintRows ?? []) as unknown as { id: string; songs: { title: string } | null }[]).map((r) => [r.id, r.songs?.title]));

  const person = (id: string) => ({ displayName: nameOf.get(id)!, portrait: portraitOf.get(id)?.portrait ?? null, picks: picksOf.get(id) ?? [] });
  const scores: number[] = [];
  let droppedNow = 0;
  let failed = 0;

  for (const [key, { a, b, pickA, pickB }] of todo) {
    await sleep(Math.max(0, MIN_GEMINI_INTERVAL_MS - (Date.now() - lastCall)));
    lastCall = Date.now();
    const label = `${nameOf.get(a)} x ${nameOf.get(b)}`;
    try {
      const songA = titleOf.get(pickA);
      const songB = titleOf.get(pickB);
      const result = await assessConnection(person(a), person(b), songA && songB ? { songA, songB } : undefined);
      if (result.status !== "match") {
        droppedNow++;
        dropped.add(key);
        console.log(`  ${label}: dropped (${result.score})`);
        continue;
      }
      const [userA, userB] = orderedPair(a, b);
      const card = alignCardEvidence(result.card, a, b);
      const { error: upsertError } = await supabase.from("connection_cards").upsert({ user_a: userA, user_b: userB, card_json: card }, { onConflict: "user_a,user_b" });
      if (upsertError) throw new Error(upsertError.message);
      scores.push(card.score ?? 0);
      console.log(`  ${label}: ${card.score}`);
    } catch (err) {
      failed++;
      console.error(`  ${label}: failed —`, err instanceof Error ? err.message : err);
    }
  }

  writeFileSync(STATE_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), dropped: [...dropped] }, null, 2));

  scores.sort((x, y) => x - y);
  const range = scores.length ? `scores ${scores[0]}–${scores[scores.length - 1]}, median ${scores[Math.floor(scores.length / 2)]}` : "no scores";
  console.log(`\nDone: ${scores.length} matches (${range}), ${droppedNow} dropped, ${failed} failed.`);
  if (failed) console.log("Re-run to retry the failed pairs (existing cards are skipped).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
