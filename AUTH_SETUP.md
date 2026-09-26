# Auth setup: email, Google, and Apple sign-in

Sign-in runs on **Supabase Auth**. The code is done. What's left is dashboard setup that
needs your accounts. Each section is independent: email works as soon as step 1 is done,
and Google/Apple buttons start working once their section is finished.

You'll need your Supabase **project ref**, the `xxxx` in `https://xxxx.supabase.co`
(it's in `NEXT_PUBLIC_SUPABASE_URL`). Anywhere below that says
`https://<ref>.supabase.co/auth/v1/callback`, substitute it.

---

## 1. Supabase basics (5 minutes, required)

1. `.env.local` needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Dashboard → Project Settings → API). **With these set, the app requires an account.**
   Without them, it runs on demo data with no sign-in, so frontend work isn't blocked.
2. Apply the new migration so Google/Apple users get their real name on their profile:
   paste `supabase/migrations/20260927000000_profile_name_from_oauth.sql` into
   Dashboard → SQL Editor and click **Run**. It only replaces one function, so it's safe to
   run more than once. (`supabase db push` also works, but only if the earlier migrations were
   applied with the CLI. If they were pasted into the SQL Editor, `db push` tries to re-create
   the tables and fails.)
3. Dashboard → **Authentication → URL Configuration**
   - **Site URL:** `http://localhost:3000` (change to your production URL when you deploy)
   - **Redirect URLs:** add
     - `http://localhost:3000/auth/callback`
     - `https://<your-production-domain>/auth/callback` (once you have one)
     - For Vercel previews, optionally: `https://*-<your-vercel-team>.vercel.app/auth/callback`
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
   - App name: `Song Galaxy`, user support email: yours, developer contact: yours.
   - Audience: **External**.
   - While the app is in **Testing**, only the Google accounts you add under **Test users**
     can sign in. Add your teammates. Click **Publish app** when you want anyone to be able to.
   - The default scopes (`openid`, `email`, `profile`) are all you need.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** (or **Clients → Create client**):
   - Application type: **Web application**
   - **Authorized JavaScript origins:** `http://localhost:3000` (plus your production URL later)
   - **Authorized redirect URIs:** `https://<ref>.supabase.co/auth/v1/callback`
     (Supabase shows this exact URL in the Google provider panel as "Callback URL". Copy it from there.)
   - Create it, then copy the **Client ID** and **Client secret**.
4. Supabase Dashboard → **Authentication → Sign In / Providers → Google**:
   enable it, paste the Client ID and Client secret, and save.

**Test:** on the login page, **Continue with Google** should take you to Google and back into the app.

---

## 3. Apple (about 20 minutes, needs the paid Apple Developer Program, $99/year)

Apple has no free tier for Sign in with Apple. If nobody on the team has a developer account,
skip this. The button then shows "That sign-in option isn't set up yet" when tapped.

In https://developer.apple.com/account → **Certificates, Identifiers & Profiles**:

1. **Create an App ID**: Identifiers → **+** → App IDs → App.
   - Description: `Song Galaxy`, Bundle ID (explicit): e.g. `com.songgalaxy.app`
   - Under Capabilities, check **Sign In with Apple**. Continue → Register.
2. **Create a Services ID** (this becomes your OAuth **client ID**): Identifiers → **+** → Services IDs.
   - Description: `Song Galaxy Web`, Identifier: e.g. `com.songgalaxy.web`. Register.
   - Click the new Services ID → check **Sign In with Apple** → **Configure**:
     - Primary App ID: the App ID from step 1
     - **Domains and Subdomains:** `<ref>.supabase.co`
     - **Return URLs:** `https://<ref>.supabase.co/auth/v1/callback`
   - Save → Continue → Save.
3. **Create a key**: Keys → **+**.
   - Name: `Song Galaxy Sign in with Apple`, check **Sign in with Apple** → Configure →
     choose the App ID from step 1 → Save → Continue → Register.
   - **Download the `.p8` file. Apple only lets you download it once.** Note the **Key ID**.
   - Note your **Team ID** (top right of the developer portal, or Membership details).
4. **Generate the client secret.** Apple doesn't give you a secret; you sign one from the key.
   - Open Supabase's Apple guide (https://supabase.com/docs/guides/auth/social-login/auth-apple).
     It has a generator: enter the Team ID, Key ID, Services ID, and the contents of the `.p8`.
   - It outputs a long JWT. That's your secret.
   - **It expires after at most 6 months.** Put a reminder in your calendar to regenerate it.
     When it expires, Apple sign-in fails until you paste in a new one.
5. Supabase Dashboard → **Authentication → Sign In / Providers → Apple**: enable it.
   - **Client IDs:** your Services ID (e.g. `com.songgalaxy.web`)
   - **Secret Key (for OAuth):** the JWT from step 4. Save.

**Test:** **Continue with Apple** should show Apple's sign-in sheet, then bring you back to the app.

Apple quirks worth knowing:
- Apple only sends the user's name the **first** time they authorize the app. After that the
  profile falls back to the email prefix. Users can choose "Hide My Email", in which case you
  get a `@privaterelay.appleid.com` address.
- Apple won't accept `localhost` return URLs. That's fine here because Apple redirects to
  Supabase's domain, not the app's.

---

## Using the local Supabase CLI instead of the hosted project (optional)

`supabase/config.toml` is already set up for local auth (redirect URLs, Google/Apple blocks).
To use Google locally, fill in `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` in
`.env.local`, set `enabled = true` under `[auth.external.google]`, and add
`http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI in Google Cloud.
Apple doesn't work against the local stack (it needs a public HTTPS domain), so test Apple on the hosted project.

---

## How it works in the code

| Piece | File |
|---|---|
| Login / signup screens (one shared form) | `app/login`, `app/signup`, `components/auth/auth-form.tsx` |
| Keeps the session fresh, sends signed-out visitors to `/login` and signed-in users away from it | `proxy.ts` → `lib/supabase/proxy.ts` |
| OAuth + email-confirmation landing: trades the code for a session cookie | `app/auth/callback/route.ts` |
| Browser client (sign in/up/out) | `lib/supabase/browser.ts` |
| "Signed in as … / Log out" on the Profile tab | `components/auth/account-row.tsx` |
| Profile row created on signup (name from email form, Google, or Apple) | trigger `handle_new_user`, latest version in `supabase/migrations/20260927000000_profile_name_from_oauth.sql` |

- **Route handlers** get the signed-in user with `getCurrentProfileId()` from
  `lib/supabase/serverAuth.ts` (already used by the backend). It returns the same id as the
  user's `profiles.id`.
- **Where users land:** after signup → `/onboarding/music`. After login → wherever they were
  headed (the `?next=` the proxy adds), otherwise `/galaxy`.
- **Still mock:** the frontend's data layer (`lib/api.ts`) still uses the demo user id `"me"`.
  Swapping it for the real signed-in id is part of the backend wiring in `MERGE_CHECKLIST.md`.
