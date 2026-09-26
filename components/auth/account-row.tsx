"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { resetWorld } from "@/lib/api";
import { resetSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Who's signed in, and the way out. Hidden when auth isn't configured. */
export function AccountRow() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!configured) return;
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, [configured]);

  if (!configured) return null;

  const signOut = async () => {
    setLeaving(true);
    await createClient().auth.signOut();
    // Don't leave this account's picks behind for the next person on this browser.
    resetSession();
    resetWorld();
    router.replace("/");
    router.refresh();
  };

  return (
    <div className="mt-8 flex items-center gap-3 border-t border-white/5 pt-5">
      <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{email ? <>Signed in as <span className="text-foreground/85">{email}</span></> : " "}</p>
      <button
        type="button"
        onClick={signOut}
        disabled={leaving}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-50"
      >
        {leaving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
        Log out
      </button>
    </div>
  );
}
