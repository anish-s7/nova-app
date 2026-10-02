import { NextResponse } from "next/server";
import { createSessionClient, getCurrentProfileId } from "@/lib/supabase/serverAuth";
import { isMissingTable } from "@/lib/supabase/missing-table";

/**
 * Every topic cluster (label/short/description/color), keyed by every id that ever pointed to it —
 * for `ClusterCacheProvider` (components/layout/cluster-cache-provider.tsx) to prime lib/galaxy/clusters.ts's
 * cache with. A retired row (superseded_by set, e.g. after a merge in
 * scripts/recompute-topic-clusters.ts) is resolved here to its live successor's label/short/
 * description/color, still under its own (retired) id — so a stored portrait's
 * `motivations[].cluster` referencing that old id (lib/gemini/generatePortrait.ts) keeps showing
 * something sensible without the portrait ever being regenerated. Session client: this is a plain
 * authenticated read, not owner-scoped, but still gated behind sign-in like every other galaxy
 * data. Needs migration 20260929000000 (topic_clusters) applied to the target project.
 */
export async function GET() {
  const profileId = await getCurrentProfileId();
  if (!profileId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("topic_clusters").select("id, label, short, description, color, superseded_by");
  // Migration not applied yet: no rows, so the client keeps lib/galaxy/clusters.ts's five static clusters.
  if (isMissingTable(error)) return NextResponse.json([]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const byId = new Map(rows.map((c) => [c.id, c]));
  function resolve(row: (typeof rows)[number], guard = new Set<string>()): (typeof rows)[number] {
    if (!row.superseded_by || guard.has(row.id)) return row;
    const next = byId.get(row.superseded_by);
    return next ? resolve(next, new Set(guard).add(row.id)) : row;
  }

  return NextResponse.json(
    rows.map((row) => {
      const c = resolve(row);
      return { id: row.id, label: c.label, short: c.short, description: c.description ?? "", color: c.color };
    }),
  );
}
