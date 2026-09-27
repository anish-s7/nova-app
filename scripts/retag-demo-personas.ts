/**
 * One-off: moves the demo personas' picks (…@song-galaxy.local) from the original situation tags
 * ("late night", "comfort", …) to the feeling tags (lib/tags.ts). The seed gave every song in a
 * group the same tags and dot, so a mechanical swap would give Noor six identical "fearless" songs:
 * feelings are hand-picked per song (HAND_PICKED) to fit how each song actually feels. Anything not
 * listed falls back to: each old tag → the closest feeling (to the pick's dot) in the listening
 * reason that tag leaned toward most. Real users' picks are never touched.
 *
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/retag-demo-personas.ts          # dry run
 *   node --env-file=.env.local node_modules/.bin/tsx scripts/retag-demo-personas.ts --apply  # write
 *
 * After --apply it refreshes each persona's cluster and portrait (portraits notice the edit).
 */
import { createServerClient } from "../lib/supabase/server";
import { TAG_WEIGHTS } from "../lib/cluster-assign";
import { refreshPrimaryCluster } from "../lib/matching/refreshPrimaryCluster";
import { upsertPortrait } from "../lib/matching/portraits";
import { FEELINGS, MAX_PICK_TAGS, TAGS, type Tag } from "../lib/tags";
import type { ClusterId } from "../lib/clusters";

const apply = process.argv.includes("--apply");

/** Per persona (email prefix) and song (loose title): the feelings that fit. */
const HAND_PICKED: Record<string, Record<string, string[]>> = {
  maya: { holocene: ["weightless", "tender"] },
  theo: {
    weightless: ["calm", "safe"],
    clairdelune: ["tender", "calm"],
    intro: ["understood", "calm"],
    gymnopedieno1: ["weightless", "calm"],
    heartbeats: ["hopeful", "tender"],
  },
  jordan: {
    marvinsroom: ["longing", "numb"],
    snooze: ["tender", "longing"],
    goodnews: ["numb", "understood"],
    getyou: ["tender", "safe"],
    deadmanwalking: ["bittersweet", "restless"],
  },
  amara: {
    glimpseofus: ["longing", "heartbroken"],
    nuvolebianche: ["aching", "calm"],
    bags: ["bittersweet", "nostalgic"],
    tadow: ["free", "hopeful"],
    hurt: ["aching", "numb"],
  },
  noor: {
    loseyourself: ["defiant", "fearless"],
    humble: ["defiant", "alive"],
    stronger: ["fearless", "alive"],
    eyeofthetiger: ["fearless", "restless"],
    runtheworld: ["alive", "euphoric"],
    // Noor's opposite feeling to Sam's on the same song (the Wander pair): keep it fierce.
    landslide: ["fearless", "hopeful"],
  },
  sam: {
    fourthofjuly: ["aching", "heartbroken"],
    casimirpulaskiday: ["heartbroken", "numb"],
    tearsinheaven: ["aching", "longing"],
    thenightwemet: ["longing", "homesick"],
    landslide: ["bittersweet", "tender"],
  },
};

/** "Gymnopédie No. 1" / "Tadow (edit)" → "gymnopedieno1" / "tadow". */
const loose = (title: string) =>
  title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "");
const isFeeling = (t: string) => (TAGS as readonly string[]).includes(t);

/** The feeling that replaces an old tag on a pick at (valence, energy). */
function feelingFor(oldTag: string, valence: number, energy: number, taken: string[]): string | null {
  const weights = Object.entries(TAG_WEIGHTS[oldTag as Tag] ?? {}) as [ClusterId, number][];
  const why = weights.sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!why) return null;
  const options = FEELINGS.filter((f) => f.why === why && !taken.includes(f.tag));
  options.sort((a, b) => Math.hypot(a.valence - valence, a.energy - energy) - Math.hypot(b.valence - valence, b.energy - energy));
  return options[0]?.tag ?? null;
}

async function main() {
  const supabase = createServerClient();
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  const personas = users.filter((u) => u.email?.endsWith("@song-galaxy.local"));
  console.log(`${personas.length} demo personas${apply ? "" : " (dry run: nothing is written)"}\n`);

  for (const persona of personas) {
    const { data: picks, error } = await supabase
      .from("song_picks")
      .select("id, tags, valence, energy, songs(title)")
      .eq("profile_id", persona.id)
      .order("created_at");
    if (error) throw new Error(error.message);
    console.log(persona.email);

    let changed = 0;
    for (const pick of (picks ?? []) as unknown as { id: string; tags: string[]; valence: number; energy: number; songs: { title: string } | null }[]) {
      const chosen = HAND_PICKED[persona.email!.split("@")[0]]?.[loose(pick.songs?.title ?? "")];
      const next: string[] = chosen ? [...chosen] : pick.tags.filter(isFeeling);
      if (!chosen) {
        for (const old of pick.tags.filter((t) => !isFeeling(t))) {
          const feeling = feelingFor(old, pick.valence, pick.energy, next);
          if (feeling) next.push(feeling);
        }
      }
      if (next.some((t) => !isFeeling(t))) throw new Error(`Not a feeling in ${JSON.stringify(next)} (${pick.songs?.title})`);
      const tags = next.slice(0, MAX_PICK_TAGS);
      const same = tags.length === pick.tags.length && tags.every((t, i) => t === pick.tags[i]);
      console.log(`  ${pick.songs?.title ?? pick.id}: ${JSON.stringify(pick.tags)} → ${same ? "(unchanged)" : JSON.stringify(tags)}${chosen ? "" : "  [automatic]"}`);
      if (same || !apply || !tags.length) continue;
      const { error: updateError } = await supabase.from("song_picks").update({ tags, updated_at: new Date().toISOString() }).eq("id", pick.id);
      if (updateError) throw new Error(`update ${pick.id}: ${updateError.message}`);
      changed++;
    }

    if (apply && changed) {
      const cluster = await refreshPrimaryCluster(supabase, persona.id);
      const portrait = await upsertPortrait(supabase, persona.id);
      console.log(`  → ${changed} picks updated; cluster ${cluster}; portrait: ${portrait?.headline ?? "(none)"}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
