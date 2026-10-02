"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RevealSequence } from "@/components/onboarding/reveal-sequence";
import { useHydrated, useSession } from "@/lib/data/session";

function RevealGate() {
  const hydrated = useHydrated();
  const { revealSeen } = useSession();
  const replay = useSearchParams().get("replay") === "1";
  const router = useRouter();
  const skip = hydrated && revealSeen && !replay;

  useEffect(() => {
    if (skip) router.replace("/galaxy");
  }, [skip, router]);

  if (!hydrated || skip) return <main className="starfield flex-1" />;
  return <RevealSequence />;
}

export default function RevealPage() {
  return (
    <Suspense fallback={<main className="starfield flex-1" />}>
      <RevealGate />
    </Suspense>
  );
}
