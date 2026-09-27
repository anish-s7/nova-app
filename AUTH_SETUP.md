# Auth setup: email and Google sign-in

Sign-in runs on **Supabase Auth**. The code is done. What's left is dashboard setup that
needs your accounts. Each section is independent: email works as soon as step 1 is done,
and the Google button starts working once its section is finished. (Apple sign-in was removed
on 2026-09-27; Google is the only social login.)

You'll need your Supabase **project ref**, the `xxxx` in `https://xxxx.supabase.co`
(it's in `NEXT_PUBLIC_SUPABASE_URL`). Anywhere below that says
`https://<ref>.supabase.co/auth/v1/callback`, substitute it.

---

## 1. Supabase basics (5 minutes, required)

1. `.env.local` needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Dashboard → Project Settings → API). **With these set, the app requires an account.**
   Without them, it runs on demo data with no sign-in, so frontend work isn't blocked.
2. Apply the new migration so Google users get their real name on their profile:
   paste `supabase/migrations/20260927000000_profile_name_from_oauth.sql` into
   Dashboard → SQL Editor and click **Run**. It only replaces one function, so it's safe to
   run more than once. (`supabase db push` also works, but only if the earlier migrations were
   applied with the CLI. If they were pasted into the SQL Editor, `db push` tries to re-create
   the tables and fails.)
3. Dashboard → **Authentication → URL Configuration**
   - **Site URL:** the production URL, `https://song-galaxy-nu.vercel.app` (set 2026-09-26)
   - **Redirect URLs** (wildcards, because email confirmation links add `?via=email&next=…`):
     - `https://song-galaxy-nu.vercel.app/**`
     - `http://localhost:3000/**`
     - `http://127.0.0.1:3000/**`
4. Dashboard → **Authentication → Sign In / Providers → Email**: make sure it's enabled.
   - **Confirm email** on: new users must click a link before they can log in. The app
     shows "Check your email" and handles the link.
   - **For a hackathon demo, consider turning it off.** Supabase's built-in email sender allows
     **2 emails per hour for the whole project**, shared by every signup from every teammate.
     Once it's used up, signups fail with "We can't send confirmation emails right now" until
     the hour resets. For real use, keep it on and add custom SMTP
     (Authentication → Emails → SMTP Settings). After that you can raise the limit under
     Authentication → Rate Limits. The built-in sender's limit can't be raised.

**Test:** `npm run dev`, go to http://localhost:3000, click **Continue**, create an account.
You should land on onboarding, and a row should appear in the `profiles` table.

---

## 2. Google (about 10 minutes, free)

1. Go to https://console.cloud.google.com and create a project (or pick an existing one).
2. **APIs & Services → OAuth consent screen** (called "Google Auth Platform" in newer consoles):
   - App name: `Resonyx`, user support email: yours, developer contact: yours.
   - Audience: **External**.
   - While the app is in **Testing**, only the Google accounts you add under **Test users**
     (up to 100) can sign in. Add your teammates. Click **Publish app** when you want anyone to
     be able to; with only the basic scopes below, publishing doesn't need Google's review.
   - The default scopes (`openid`, `email`, `profile`) are all you need. Don't add others:
     anything beyond them triggers Google's verification process.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** (or **Clients → Create client**):
   - Application type: **Web application**
   - **Authorized JavaScript origins:** `https://song-galaxy-nu.vercel.app` and `http://localhost:3000`
   - **Authorized redirect URIs:** `https://<ref>.supabase.co/auth/v1/callback`
     (Supabase shows this exact URL in the Google provider panel as "Callback URL". Copy it from there.)
   - Create it, then copy the **Client ID** and **Client secret**.
4. Supabase Dashboard → **Authentication → Sign In / Providers → Google**:
   enable it, paste the Client ID and Client secret, and save.

**Test:** on the login page, **Continue with Google** should take you to Google and back into the app.
A brand-new account lands on onboarding (`/auth/callback` sends anyone with no songs there); an
existing one goes where it was headed. Signing in with Google using the same email as an existing
confirmed email/password account links to that account (Supabase's automatic identity linking),
so the songs are kept.

---

## Using the local Supabase CLI instead of the hosted project (optional)

`supabase/config.toml` is already set up for local auth (redirect URLs, the Google block).
To use Google locally, fill in `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` in
`.env.local`, set `enabled = true` under `[auth.external.google]`, and add
`http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI in Google Cloud.

---

## How it works in the code

| Piece | File |
|---|---|
| Login / signup screens (one shared form) | `app/login`, `app/signup`, `components/auth/auth-form.tsx` |
| Keeps the session fresh, sends signed-out visitors to `/login` and signed-in users away from it | `proxy.ts` → `lib/supabase/proxy.ts` |
| Google + email-confirmation landing: trades the code for a session cookie; new accounts with no songs go to onboarding | `app/auth/callback/route.ts` |
| Browser client (sign in/up/out) | `lib/supabase/browser.ts` |
| "Signed in as … / Log out" on the Profile tab | `components/auth/account-row.tsx` |
| Profile row created on signup (name from the email form or Google) | trigger `handle_new_user`, latest version in `supabase/migrations/20260927000000_profile_name_from_oauth.sql` |

- **Route handlers** get the signed-in user with `getCurrentProfileId()` from
  `lib/supabase/serverAuth.ts` (already used by the backend). It returns the same id as the
  user's `profiles.id`.
- **Where users land:** after signup → `/onboarding/pick`. After login → wherever they were
  headed (the `?next=` the proxy adds), otherwise `/galaxy`. After Google → onboarding if the
  account has no songs yet, otherwise the same as login.
- **Real data:** with the Supabase keys set, the frontend's data layer (`lib/api.ts`) uses the
  signed-in user through the API routes. "me" is only an alias inside the frontend (`ME_ID`); the
  backend always takes the user from the session cookie.
