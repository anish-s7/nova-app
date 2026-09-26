"use client";

import { useEffect, useState } from "react";
import { getArrival, REAL_DATA } from "@/lib/api";
import type { GalaxyEdge, GalaxyNode } from "@/lib/types";

export type Arrival = { node: GalaxyNode; edges: GalaxyEdge[] };

let arrived: Arrival[] = [];

export function resetRealtime() {
  arrived = [];
}

/**
 * Live galaxy updates. Isolated so the mock can be swapped for Supabase Realtime
 * without touching the canvas.
 */
export function useGalaxyRealtime(enabled: boolean) {
  const [arrivals, setArrivals] = useState<Arrival[]>(arrived);

  useEffect(() => {
    // The simulated arrival is mock-only; real arrivals need a Realtime subscription (backburner).
    if (!enabled || REAL_DATA || arrived.length) return;

    // ---------------------------------------------------------------------
    // PLACEHOLDER: Supabase Realtime subscription. Replace the timer below with:
    //
    //   const channel = supabase
    //     .channel("galaxy")
    //     .on("postgres_changes", { event: "INSERT", schema: "public", table: "connections" }, (payload) => {
    //       // fetch the new node + its similarity edges, then setArrivals((a) => [...a, arrival])
    //     })
    //     .subscribe();
    //   return () => { supabase.removeChannel(channel); };
    // ---------------------------------------------------------------------
    const timer = setTimeout(() => {
      arrived = [getArrival()];
      setArrivals(arrived);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [enabled]);

  return arrivals;
}
