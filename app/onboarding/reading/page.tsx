"use client";

import { ReadingSequence } from "@/components/onboarding/reading-sequence";
import { useHydrated } from "@/lib/data/session";

export default function ReadingPage() {
  const hydrated = useHydrated();
  return hydrated ? <ReadingSequence /> : <main className="starfield flex-1" />;
}
