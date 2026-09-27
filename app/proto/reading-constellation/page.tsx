"use client";
import { ReadingSequence } from "@/components/reading-sequence";
export default function Page() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-black/60 p-6">
      <div className="relative flex h-[844px] max-h-[calc(100dvh-3rem)] w-[390px] flex-col overflow-hidden rounded-[2.75rem] border border-white/10">
        <ReadingSequence />
      </div>
    </div>
  );
}
