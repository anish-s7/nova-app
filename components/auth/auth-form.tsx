"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { GoogleIcon } from "@/components/auth/brand-icons";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { resetWorld } from "@/lib/api";
import { listenForConfirmation } from "@/lib/auth-handoff";
import { safeNextPath } from "@/lib/safe-next";
import { resetSession } from "@/lib/session";
import { replayGalaxyIntro } from "@/lib/galaxy-intro";
import { createClient } from "@/lib/supabase/browser";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Mode = "login" | "signup";

const COPY = {
  signup: {
    title: "Create your account",
    subtitle: "Find people who listen for the same reasons you do.",
    submit: "Create account",
    switchText: "Already have an account?",
    switchLink: { href: "/login", label: "Log in" },
  },
  login: {
    title: "Welcome back",
    subtitle: "Log in to see your galaxy.",
    submit: "Log in",
    switchText: "New to Nova?",
    switchLink: { href: "/signup", label: "Create an account" },
  },
} as const;

const fieldClass =
  "h-12 w-full rounded-2xl border border-white/10 bg-card/60 px-4 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60";

/** Supabase's messages are written for developers; these are for people. */
function friendly(error: { message: string; code?: string }) {
  // Project-wide cap on emails from Supabase's built-in sender (2/hour on hosted projects),
  // shared by every signup. Not something this user did. See AUTH_SETUP.md to lift it.
  if (error.code === "over_email_send_rate_limit") {
    console.warn("Supabase email rate limit hit. Turn off Confirm email or add custom SMTP (AUTH_SETUP.md, step 1).");
    return "We can't send confirmation emails right now. Please try again later.";
  }
  // Same email or IP retried within a few seconds.
  if (error.code === "over_request_rate_limit") return "One moment. Please wait a few seconds and try again.";
  const m = error.message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match an account.";
  if (m.includes("already registered")) return "An account with this email already exists. Try logging in.";
  if (m.includes("email not confirmed")) return "Confirm your email first. Check your inbox for the link.";
  if (m.includes("password should be")) return "Use a password with at least 6 characters.";
  if (m.includes("for security purposes")) return "One moment. Please wait a few seconds and try again.";
  if (m.includes("provider is not enabled")) return "That sign-in option isn't set up yet.";
  return error.message;
}

/** Asks Supabase which OAuth providers are switched on. Fails open so a network blip doesn't block sign-in. */
/** Google is the only social sign-in (Apple was removed 2026-09-27). */
type Provider = "google";

async function providerEnabled(provider: Provider) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
    });
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return settings.external?.[provider] !== false;
  } catch {
    return true;
  }
}

export function AuthForm({ mode, next, initialError, initialNotice }: { mode: Mode; next?: string; initialError?: string; initialNotice?: string }) {
  const router = useRouter();
  const copy = COPY[mode];
  const configured = isSupabaseConfigured();
  // New accounts go through onboarding; returning users go where they were headed.
  const destination = mode === "signup" ? "/onboarding/pick" : safeNextPath(next);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"email" | Provider | null>(null);
  const [error, setError] = useState(initialError ?? "");
  const [notice, setNotice] = useState(initialNotice ?? "");
  // Set while a signup waits on its confirmation email.
  const [awaitingEmail, setAwaitingEmail] = useState(false);

  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`;

  const finish = () => {
    replayGalaxyIntro();
    // Local demo state belongs to whoever used this browser last.
    if (mode === "signup") {
      resetSession();
      resetWorld();
    }
    router.replace(destination);
    router.refresh();
  };

  // The confirmation link opens in a new tab. When that tab signs in, carry on here
  // instead, so the person isn't left with two copies of the app open.
  useEffect(() => {
    if (!awaitingEmail) return;
    let done = false;
    const continueHere = () => {
      if (done) return;
      done = true;
      finish();
    };
    const stop = listenForConfirmation(continueHere);
    // Backstop if the message is missed (or BroadcastChannel is unavailable): the other tab's
    // sign-in writes a shared cookie, so a local session check here picks it up.
    const check = async () => {
      const { data } = await createClient().auth.getSession();
      if (data.session) continueHere();
    };
    const poll = setInterval(check, 2500);
    window.addEventListener("focus", check);
    return () => {
      stop();
      clearInterval(poll);
      window.removeEventListener("focus", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish only reads stable values
  }, [awaitingEmail]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setPending("email");
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name.trim() }, emailRedirectTo: `${callbackUrl()}&via=email` },
      });
      setPending(null);
      if (error) return setError(friendly(error));
      // With email confirmation on, there's no session until they click the link.
      if (!data.session) {
        setAwaitingEmail(true);
        return setNotice(`Check ${email} for a link to confirm your account. Once you click it, this page will continue on its own.`);
      }
      return finish();
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(null);
    if (error) return setError(friendly(error));
    finish();
  };

  const oauth = async (provider: Provider) => {
    setError("");
    setPending(provider);
    // A disabled provider would otherwise dump the user on a raw Supabase JSON error page.
    if (!(await providerEnabled(provider))) {
      setPending(null);
      return setError("Google sign-in isn't set up yet. Use email for now.");
    }
    // Whoever comes back from Google may not be whoever used this browser last, so start clean,
    // as email signup does. (Brand-new accounts are sent to onboarding by /auth/callback.)
    resetSession();
    resetWorld();
    replayGalaxyIntro();
    const { error } = await createClient().auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl() } });
    // On success the browser is already navigating to the provider.
    if (error) {
      setPending(null);
      setError(friendly(error));
    }
  };

  const busy = pending !== null;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="px-6 pt-5">
        <Link href="/" aria-label="Nova home">
          <Logo />
        </Link>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-8 pt-10">
        <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-pretty text-muted-foreground">{copy.subtitle}</p>

        {!configured ? (
          <div role="status" className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <p className="font-medium">Sign-in isn&apos;t set up in this environment</p>
            <p className="mt-1 text-muted-foreground">Add the Supabase keys to .env.local (see AUTH_SETUP.md). Until then the app runs on demo data.</p>
            <Link href="/onboarding/pick" className="mt-3 inline-block font-medium text-primary hover:underline">
              Continue with demo data
            </Link>
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => oauth("google")}
            disabled={busy || !configured}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending === "google" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <GoogleIcon className="size-[18px]" />}
            Continue with Google
          </button>
        </div>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
          <span className="h-px flex-1 bg-white/10" />
          or with email
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === "signup" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={80}
                placeholder="What should people call you?"
                className={fieldClass}
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Password</span>
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              className={fieldClass}
            />
          </label>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
              {notice}
            </p>
          ) : null}

          <Button type="submit" disabled={busy || !configured} className="btn-glow mt-2 h-12 w-full rounded-full text-base">
            {pending === "email" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {copy.submit}
          </Button>
        </form>

        <p className="mt-auto pt-8 text-center text-sm text-muted-foreground">
          {copy.switchText}{" "}
          <Link href={copy.switchLink.href} className="font-medium text-foreground hover:text-primary">
            {copy.switchLink.label}
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-muted-foreground/80">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy policy
          </Link>
        </p>
      </div>
    </main>
  );
}
