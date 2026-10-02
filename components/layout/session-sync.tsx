"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { setSession, type FailureKey } from "@/lib/data/session";

const KEYS: FailureKey[] = ["spotify", "analysis", "galaxy", "card"];

/** Reads ?demo=1 and ?fail=spotify,card from the URL into session state so they survive navigation. */
export function SessionSync() {
  const params = useSearchParams();
  const demo = params.get("demo");
  const fail = params.get("fail");

  useEffect(() => {
    if (demo !== null) setSession({ demo: demo === "1" || demo === "true" }, true);
  }, [demo]);

  useEffect(() => {
    if (fail !== null) setSession({ failures: fail.split(",").filter((k): k is FailureKey => KEYS.includes(k as FailureKey)) });
  }, [fail]);

  return null;
}
