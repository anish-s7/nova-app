import type { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { REAL_DATA } from "@/lib/data-source";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { redirectWithSession, updateSession } from "@/lib/supabase/proxy";
import type { Database } from "@/lib/supabase/types";

/** Screens that need an account. The welcome page, auth pages and prototypes stay public. */
const PROTECTED = ["/onboarding", "/galaxy", "/connections", "/messages", "/me", "/people"];
/** The app itself: only for accounts that have finished onboarding. */
const APP = ["/galaxy", "/connections", "/messages", "/me", "/people"];
/** Pages a signed-in user has no reason to see. */
const AUTH_PAGES = ["/login", "/signup"];

/** Remembers, per user id, that onboarding is done, so the picks check runs once per browser, not per request. */
const ONBOARDED_COOKIE = "sg-onboarded";

const matches = (path: string, prefixes: string[]) => prefixes.some((p) => path === p || path.startsWith(`${p}/`));

/**
 * Onboarding is done once the account has a saved pick (the reading screen waits for the save).
 * Only positive answers are cached: nothing un-onboards an account, and a forged cookie only
 * skips your own onboarding.
 */
async function isOnboarded(request: NextRequest, supabase: SupabaseClient<Database>, user: User) {
  if (request.cookies.get(ONBOARDED_COOKIE)?.value === user.id) return true;
  const { count, error } = await supabase.from("song_picks").select("id", { count: "exact", head: true }).eq("profile_id", user.id);
  if (error) {
    // Fail toward the app: a signed-in person stuck in onboarding is worse than an empty galaxy.
    console.error("proxy: onboarding check failed", error);
    return true;
  }
  return (count ?? 0) > 0;
}

function remember(response: NextResponse, user: User) {
  response.cookies.set(ONBOARDED_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return response;
}

export async function proxy(request: NextRequest) {
  // No Supabase keys yet: run the mock app without sign-in (see AUTH_SETUP.md).
  if (!isSupabaseConfigured()) return;

  const { supabase, response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!user) {
    if (!matches(pathname, PROTECTED)) return response();
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return redirectWithSession(url, response());
  }

  // Where a signed-in person belongs is decided by the home screen, the auth pages and the app
  // screens. With mock data forced on, picks never reach the database, so there's nothing to check.
  const home = pathname === "/";
  const auth = matches(pathname, AUTH_PAGES);
  const app = matches(pathname, APP);
  if (!home && !auth && !app) return response();
  if (!REAL_DATA) return auth ? redirectWithSession(new URL("/galaxy", request.url), response()) : response();

  const onboarded = await isOnboarded(request, supabase, user);
  if (!onboarded) {
    // The app screens and home both mean "take me in"; until onboarding is done, that's onboarding.
    return redirectWithSession(new URL("/onboarding/music", request.url), response());
  }
  if (home || auth) return remember(redirectWithSession(new URL("/galaxy", request.url), response()), user);
  return remember(response(), user);
}

export const config = {
  // Everything except static assets and images. API routes are included so their
  // session cookie stays fresh; they enforce auth themselves via serverAuth.ts.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|covers/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
