"use client";

import { ReadingSequence } from "@/components/reading-sequence";
import { useHydrated } from "@/lib/session";

export default function ReadingPage() {
  const hydrated = useHydrated();
  return hydrated ? <ReadingSequence /> : <main className="starfield flex-1" />;
}
