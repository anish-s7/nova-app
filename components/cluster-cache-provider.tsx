"use client";

import { useEffect, useState, type ReactNode } from "react";
import { REAL_DATA } from "@/lib/data-source";
import { primeClusters, type Cluster } from "@/lib/clusters";

let loaded = false;
let inFlight: Promise<void> | null = null;

/** Fetches the real cluster table once per page load and shares the result across every mount. */
function loadClusters(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = fetch("/api/clusters")
    .then((res) => (res.ok ? (res.json() as Promise<Cluster[]>) : []))
    .then((clusters) => {
      primeClusters(clusters);
      loaded = true;
    })
    .catch(() => {
      // Left un-primed: getCluster() keeps serving its static fallback until a later mount retries.
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Primes lib/clusters.ts's cache from the real `topic_clusters` table before anything renders a
 * cluster label or color. Mock mode never fetches (getCluster's static fallback is already
 * correct there). `getCluster` is called synchronously all over the galaxy UI, so this can't hand
 * callers a promise — it forces one re-render after the fetch resolves instead, same as any other
 * "data arrived after first paint" fetch in this app.
 */
export function ClusterCacheProvider({ children }: { children: ReactNode }) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!REAL_DATA || loaded) return;
    let cancelled = false;
    loadClusters().then(() => {
      if (!cancelled) forceUpdate((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
}
