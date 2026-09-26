import type { ReactNode } from "react";

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center sm:nebula sm:py-8">
      <div className="relative isolate flex h-dvh w-full flex-col overflow-hidden bg-background sm:h-[844px] sm:max-h-[calc(100dvh-4rem)] sm:w-[390px] sm:rounded-[2.75rem] sm:border sm:border-white/10 sm:shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7),0_0_0_8px_oklch(1_0_0/0.02)]">
        {children}
      </div>
    </div>
  );
}
