"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export type Account = { email: string | null; name: string | null };

/**
 * The signed-in user's email and display name. Name comes from whichever provider set it:
 * email signup stores `display_name`, Google `full_name`, Apple `name`. Null when auth
 * isn't configured (demo mode) or while loading.
 */
export function useAccount(): Account & { configured: boolean } {
  const configured = isSupabaseConfigured();
  const [account, setAccount] = useState<Account>({ email: null, name: null });

  useEffect(() => {
    if (!configured) return;
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
        const name = [meta.display_name, meta.full_name, meta.name].find((v): v is string => typeof v === "string" && !!v.trim()) ?? null;
        setAccount({ email: user?.email ?? null, name });
      });
  }, [configured]);

  return { ...account, configured };
}
