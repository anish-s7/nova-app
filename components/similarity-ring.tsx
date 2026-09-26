import type { CSSProperties, ReactNode } from "react";
import { getCluster } from "@/lib/clusters";

/** Arc around an avatar that fills to the similarity score. Animated by the parent list via [data-ring]. */
export function SimilarityRing({ value, cluster, size, children }: { value: number; cluster: string; size: number; children: ReactNode }) {
  const pad = 5;
  const r = size / 2 + pad - 1.5;
  const box = size + pad * 2;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: box, height: box, "--tone": getCluster(cluster).color } as CSSProperties}>
      <svg viewBox={`0 0 ${box} ${box}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="white" strokeOpacity="0.07" strokeWidth="2" />
        <circle
          data-ring={value}
          cx={box / 2}
          cy={box / 2}
          r={r}
          fill="none"
          stroke="var(--tone)"
          strokeWidth="2"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${value} 1`}
         
        />
      </svg>
      {children}
    </span>
  );
}
