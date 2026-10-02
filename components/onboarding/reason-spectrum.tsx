"use client";

import { animate, stagger } from "animejs";
import { useAnime } from "@/hooks/use-anime";
import { getCluster } from "@/lib/galaxy/clusters";
import type { InferredMotivation } from "@/lib/data/types";
import { ClusterStar } from "@/components/common/cluster-star";

/** One bar, split by how much each kept reason accounts for your listening. */
export function ReasonSpectrum({ motivations }: { motivations: InferredMotivation[] }) {
  const kept = motivations.filter((m) => m.feedback !== "rejected");
  const total = kept.reduce((sum, m) => sum + m.confidence, 0);
  const key = kept.map((m) => `${m.id}:${m.confidence}`).join("|");

  const root = useAnime<HTMLDivElement>(() => {
    animate("[data-seg]", { scaleX: [0, 1], duration: 900, delay: stagger(90), ease: "outExpo" });
    animate("[data-legend]", { opacity: [0, 1], translateY: [4, 0], duration: 500, delay: stagger(70, { start: 300 }), ease: "outQuart" });
  }, [key]);

  if (!kept.length || total === 0) return null;

  return (
    <div ref={root}>
      <div className="flex h-2.5 gap-1 overflow-hidden rounded-full" role="img" aria-label={kept.map((m) => `${m.label} ${Math.round((m.confidence / total) * 100)}%`).join(", ")}>
        {kept.map((m) => {
          const color = getCluster(m.cluster).color;
          return (
            <span
              key={m.id}
              data-seg
              className="h-full origin-left rounded-full"
              style={{ flexGrow: m.confidence, background: `linear-gradient(90deg, ${color}, color-mix(in oklch, ${color} 70%, white))`, boxShadow: `0 0 10px -2px ${color}` }}
            />
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {kept.map((m) => (
          <li key={m.id} data-legend className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ClusterStar color={getCluster(m.cluster).color} size={12} />
            {getCluster(m.cluster).short}
            <span className="tabular-nums text-foreground/80">{Math.round((m.confidence / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
