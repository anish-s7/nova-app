"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { useAccount } from "@/components/auth/use-account";
import { resetWorld } from "@/lib/api";
import { replayGalaxyIntro } from "@/lib/galaxy-intro";
import { resetSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/browser";

/** Who's signed in, and the way out, as a settings-list row. Hidden when auth isn't configured. */
export function AccountRow({ className }: { className?: string }) {
  const router = useRouter();
  const { configured, email } = useAccount();
  const [leaving, setLeaving] = useState(false);

  if (!configured) return null;

  const signOut = async () => {
    setLeaving(true);
    await createClient().auth.signOut();
    // Don't leave this account's picks behind for the next person on this browser.
    resetSession();
    resetWorld();
    replayGalaxyIntro();
    router.replace("/");
    router.refresh();
  };

  return (
    <div className={className ?? "flex min-h-14 items-center gap-3 px-4"}>
      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{email ? <>Signed in as <span className="text-foreground/85">{email}</span></> : " "}</p>
      <button
        type="button"
        onClick={signOut}
        disabled={leaving}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 border border-white/15 px-3 text-sm text-foreground/85 transition-colors hover:bg-white/5 disabled:opacity-50"
      >
        {leaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
        Log out
      </button>
    </div>
  );
}
