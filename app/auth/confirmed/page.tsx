"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { buttonVariants } from "@/components/ui/button";
import { announceConfirmation } from "@/lib/auth-handoff";
import { safeNextPath } from "@/lib/safe-next";
import { cn } from "@/lib/utils";

/**
 * Landing tab for email confirmation links (they always open a new tab). Tells the
 * tab still waiting on "Check your email" to carry on, and always stops here itself
 * so the person isn't left with the app open twice.
 */
function Confirmed() {
  const raw = useSearchParams().get("next");
  const next = raw ? safeNextPath(raw) : "/onboarding/pick";
  const [state, setState] = useState<"checking" | "handedOff" | "standalone">("checking");

  useEffect(() => {
    let cancelled = false;
    announceConfirmation().then((ok) => {
      if (cancelled) return;
      // Deliberately no window.close(): in some mail setups the browser allows it, and the
      // tab vanishes before anyone can read this. Let the person close it themselves.
      setState(ok ? "handedOff" : "standalone");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-0 flex-1 flex-col px-6 pb-8 pt-5">
      <Logo />
      <div className="flex flex-1 flex-col items-center justify-center text-center" aria-live="polite">
        {state === "checking" ? (
          <p className="text-sm text-muted-foreground">Confirming your email…</p>
        ) : (
          <>
            <span className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CircleCheck className="size-7" aria-hidden />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">Email confirmed</h1>
            <p className="mt-2 max-w-72 text-pretty text-muted-foreground">
              {state === "handedOff"
                ? "You're all set. Your other Resonyx tab has already moved on."
                : "You're all set. If Resonyx is still open in another tab, you can pick up there."}
            </p>
            <p className="mt-4 text-sm font-medium text-foreground">You can close this tab now.</p>
            {state === "handedOff" ? (
              <Link href={next} className="mt-8 text-sm text-muted-foreground hover:text-foreground">
                Or continue here instead
              </Link>
            ) : (
              <Link href={next} className={cn(buttonVariants(), "btn-glow mt-8 h-12 w-full max-w-72 rounded-full text-base")}>
                Continue here
              </Link>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function ConfirmedPage() {
  return (
    <Suspense fallback={<main className="flex-1" />}>
      <Confirmed />
    </Suspense>
  );
}
