# 0005. Accounts and Google sign-in on Supabase Auth

**Date**: 2026-07-05
**Status**: Accepted

## Summary

Reel is login-walled, so it needs a real account system that scopes every user's data to just them. We use Supabase Auth with Google OAuth as the only sign-in method, cookie-based sessions managed by `@supabase/ssr` (server components, server actions, and middleware all read the same session), and an adaptive `/` that shows a public landing when signed out and the app home when signed in. This feature also stands up the user-scoped Supabase clients (browser and server) that every later feature reads and writes user data through, so row-level security (RLS) applies. The one data change is a tweak to the existing `handle_new_user` trigger so it copies the Google name and avatar into the new profile row.

## Context

> ⚠️ Premise note: I checked the confirmed decisions and they hold, with two things to name plainly. First, a hard prerequisite: Google OAuth must be enabled in the Supabase dashboard with a Google OAuth client (created in the Google Cloud Console) and the correct redirect URLs, or end-to-end sign-in cannot work no matter how correct the code is. This is dashboard plus Google Cloud setup the engineer does; it is not code. Second, an adaptive `/` (public landing vs authed home in one route) is safe only if the signed-out branch renders no authed data and the signed-in branch is gated by a real `getUser()` check (which validates the token with Supabase), not by trusting the cookie. Both are handled in the design below. One honest product limit to record, not fix: Google-only sign-in means a person with no Google account cannot sign in at all. That is acceptable for the MVP (Google verifies the email, so we skip password reset and email confirmation entirely) and email plus password can be added later; it is carried as a Follow-up.

The app is fully login-walled. Each user's imported ratings, taste profile, and watchlist are private, so per-user data isolation is a hard requirement, not a nice-to-have. Before any of the later features (feed, watchlist, import) can exist, the app needs two things: a way for a user to sign in and get a durable session, and a Supabase client that carries that user's identity so RLS scopes their rows to them. This feature delivers both. It is the gate for everything else and it establishes the user-scoped client pattern every later feature reuses.

The forces at play:

- Small team, MVP. Ship the smallest correct auth, not a full identity suite. Never build auth from scratch; Supabase Auth already owns this (ADR 0001).
- Security matters. Auth is the part of the app where a subtle mistake leaks another user's data. The session must be validated server-side, and user data must only ever flow through the user-scoped client, never the secret key.
- RLS is already enabled on `profiles` (ADR 0002) and is only enforced when queries run through a user-scoped client. The service client (`src/lib/supabase/service.ts`, secret key) exists for system paths and must stay off user data paths.
- The design system is ready (ADR 0004): the AppShell, the UserMenu, the Button, and the landing tokens. The landing and sign-in UI use those; no new design work.
- The `profiles` table and its `handle_new_user` trigger already exist (ADR 0002). The trigger currently inserts only the id. This feature updates it in place; it adds no table.

## Requirements

**User stories**

- As a new visitor, I can sign in with my Google account from the landing page so my data is saved and private to me.
- As a returning user, I stay signed in across reloads and land on the app home without signing in again.
- As a signed-in user, I can see my name and avatar and sign out from the app shell.
- As any user, I can never see another user's data, because every read and write is scoped to me.

**Acceptance criteria**

- AC-1: A visitor can sign in with Google from the landing at `/` ("Continue with Google"); on success a Supabase session is created and they land on the app home.
- AC-2: On first sign-in, a `profiles` row is auto-created with `display_name` and `avatar_url` populated from the Google identity (via the updated `handle_new_user` trigger).
- AC-3: The session is cookie-based and persists across reloads and across server and client, refreshed by middleware; a signed-in user stays signed in on reload.
- AC-4: `/` is adaptive: signed-out shows the landing with the sign-in button; signed-in shows the app home inside the AppShell (with the UserMenu showing the user's name/avatar).
- AC-5: A signed-in user can sign out from the UserMenu; afterward they return to the public landing and protected routes are no longer accessible.
- AC-6: Protected app routes redirect to `/` when there is no session, enforced by middleware AND re-checked server-side; all user data access uses the user-scoped Supabase client (never the secret key), so RLS scopes each user to their own rows.
- AC-7: The app exposes a browser Supabase client and a server Supabase client (via `@supabase/ssr`) that carry the signed-in user's session, for all later features to use.

## Options considered

**Option 1 (chosen): Supabase Auth with `@supabase/ssr` cookie sessions, Google OAuth (PKCE), and middleware route protection.** The session lives in httpOnly cookies. A browser client and a server client both read those cookies, so server components, server actions, route handlers, and middleware all see the same authenticated user. Middleware refreshes the token on every request and redirects unauthenticated requests for protected routes. Server-side checks use `getUser()` (validated against Supabase). Con: `getUser()` adds a network round trip versus trusting the cookie, and middleware runs on every matched request. Both are cheap and correct, and this is the pattern Supabase supports for the App Router.

**Option 2: Supabase Auth with client-only session handling (session in `localStorage`, no SSR helpers).** Simpler to wire; one client, no middleware. Con: this breaks the server. Server components and server actions would not see the session, so RLS on the server has no user to scope to, and the adaptive `/` cannot render the authed view server-side. It is also less secure (a token in `localStorage` is reachable by any script, versus an httpOnly cookie). For an app that renders and reads data on the server, this is the wrong shape.

**Option 3: Add email plus password (with reset and confirmation) alongside Google now.** More sign-in coverage on day one. Con: it adds real surface the MVP does not need yet, a password reset flow, an email confirmation flow, password storage and rules, and more UI, all of which Google-only sidesteps because Google verifies the email. More to build and secure than the MVP warrants; deferred to a Follow-up.

## Decision

**Chosen option**: Option 1. Supabase Auth with `@supabase/ssr` cookie sessions, Google OAuth via PKCE, an adaptive public-or-app `/`, and middleware plus server-side `getUser()` protection, standing up the user-scoped clients every later feature reuses.

The concrete picks:

**The three Supabase clients (distinct roles).**
- Browser client: `src/lib/supabase/client.ts`, `createBrowserClient(url, publishableKey)`. Used by client components (the sign-in button).
- Server client: `src/lib/supabase/server.ts`, `createServerClient(url, publishableKey, { cookies: { getAll, setAll } })` wired to Next's `cookies()`. Used by server components, server actions, and route handlers. Important: a Server Component cannot set cookies, so `setAll` must be wrapped in a `try/catch` that swallows the error. That is fine because the middleware (below) is what actually persists a refreshed token; the swallowed write in a Server Component is a no-op by design.
- Middleware session client: created inside `updateSession` in `src/middleware.ts`, reads and writes the request/response cookies to refresh the token on every request. Load-bearing cookie contract: `updateSession` must return the SAME `NextResponse` object whose cookies were mutated during the refresh. If a branch needs to redirect, build the redirect and then copy the mutated cookies onto it (`response.cookies.getAll()` → the redirect response); building a fresh `NextResponse.redirect(...)` without copying silently drops the refreshed session cookies and logs users out at random.

These three are the user-scoped clients (they carry the signed-in user, so RLS applies). They use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (both already in `.env.local`). They are distinct from the existing service client (`src/lib/supabase/service.ts`, secret key), which stays for system paths only and must never touch a user data path.

**The Google OAuth flow (PKCE).**
- Client button ("Continue with Google"): a `"use client"` leaf calls `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: \`${window.location.origin}/auth/callback\` } })`. Supabase redirects the browser to Google's consent screen.
- Callback route handler: `src/app/auth/callback/route.ts` reads the `code` query param, calls `supabase.auth.exchangeCodeForSession(code)` (this sets the session cookies), then redirects to `/`. On error it redirects to `/` (landing) rather than leaking anything.

**The `handle_new_user` trigger update (migration, create or replace).** Keep it `SECURITY DEFINER` with `set search_path = ''`. Populate from the Google identity's `raw_user_meta_data`:
```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;
```
This updates the existing function; the trigger binding and the table are unchanged. Server-side write via the trigger keeps profile creation atomic with the auth user and off the client.

**`getUser()` not `getSession()` (a hard security rule).** For every server-side gate and for reading the current user, call `supabase.auth.getUser()`, which validates the token with the Supabase auth server. Never gate on `getSession()`, which returns whatever the cookie says without validating it. Trusting `getSession()` for authorization is the classic Supabase-SSR security bug; treat it as forbidden on any auth decision.

**Route protection (matcher).** The middleware matcher runs on everything except static assets and images:
```
matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
```
Inside `updateSession`, refresh the token, then: if there is no user AND the path is not a public route (`/` and `/auth/callback`), redirect to `/` (copying cookies onto the redirect per the contract above). **The middleware matcher is a UX fast-path, not the security boundary.** A route the matcher misses, a Server Action, or a route handler added later without its own check would otherwise be unguarded. So the real gate is a per-route server-side `getUser()` check: every authed page, layout, server action, and route handler that reads or mutates user data MUST call `getUser()` itself and redirect/deny if absent. Middleware is the convenience redirect on top; the server-side `getUser()` in each authed surface is what actually protects the data. Write this as the standing rule for every future authed route.

**Sign out.** A server action `signOut()` in `src/app/auth/actions.ts` calls `supabase.auth.signOut()` then `redirect("/")`. It is wired to the AppShell UserMenu's sign-out control (a small form/button that posts the action).

**Reading the current user for the UserMenu.** Read name and avatar from the `getUser()` user's metadata (`user.user_metadata.full_name` / `avatar_url`), not a separate `profiles` query. The authed home already calls `getUser()` to gate, so the name and avatar come for free with no extra round trip. A `profiles` read through the user-scoped server client stays available for later features that need the editable profile fields.

**File layout under `src/`.**
- `src/lib/supabase/client.ts` (browser client)
- `src/lib/supabase/server.ts` (server client)
- `src/middleware.ts` (`updateSession`)
- `src/app/auth/callback/route.ts` (OAuth callback)
- `src/app/auth/actions.ts` (`signOut` server action)
- `src/components/continue-with-google.tsx` (`"use client"` sign-in button)
- `src/app/page.tsx` (adaptive `/`: landing vs authed home)

**Implementation skills**: frontend-design

## Rationale

Cookie sessions via `@supabase/ssr` are the right shape because the app renders and reads data on the server. Server components need the user to render the authed `/`, and RLS on the server needs a user-scoped client to scope rows. HttpOnly cookies give both the browser and the server the same session, and middleware refreshes the token so a signed-in user does not silently expire mid-session (AC-3). Option 2's `localStorage` approach cannot serve the server and is less secure, so it is out.

Google-only is fine for the MVP because Google verifies the email, which removes the two flows that make email/password heavy (password reset and email confirmation) and shrinks the surface we have to secure. The tradeoff (non-Google users are locked out) is named and deferred, not hidden.

The adaptive `/` keeps the surface small: one route, one wordmark, no separate `/login` page. It is safe because the signed-out branch renders only public marketing content and the signed-in branch is gated by a validated `getUser()` call, so the two branches never cross.

`getUser()` over `getSession()` is the load-bearing security choice. `getSession()` trusts the cookie as-is, so an attacker-shaped or stale cookie could pass a gate that only checks it; `getUser()` asks Supabase to validate the token. The round trip is worth it because it is the difference between real authorization and a check that can be spoofed.

Populating the profile from the trigger (server-side, atomic with the auth user) beats a client write after sign-in: the client could fail, be skipped, or be tampered with, and a client write would need its own RLS insert path. The trigger already fires on user creation and runs `SECURITY DEFINER`, so it is the natural, tamper-resistant place to copy the Google name and avatar.

## Feature design

**Data model sketch.** No new tables. `auth.users` (Supabase-managed) and `profiles` (ADR 0002: `id`, `display_name`, `avatar_url`, `onboarding_completed`, RLS enabled, 1:1 with `auth.users`) are unchanged in shape. The only change is the `handle_new_user` trigger function, updated (create or replace) to copy into the new profile row:
- `display_name` from `coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name')`
- `avatar_url` from `coalesce(raw_user_meta_data ->> 'avatar_url', raw_user_meta_data ->> 'picture')`
Still `SECURITY DEFINER` with `set search_path = ''`. Trigger binding unchanged.

**State transitions (session lifecycle).**
```
anonymous
   | Continue with Google (signInWithOAuth, PKCE)
   v
Google consent screen
   | redirect to /auth/callback?code=...
   v
/auth/callback (exchangeCodeForSession -> sets session cookies)
   | first sign-in only: handle_new_user trigger creates the profile row
   v
authenticated (session cookie; middleware refreshes token each request)
   | sign out (signOut server action -> clears cookies)
   v
anonymous (back at the public landing)
```

**API surface (auth touch points).**

| Name | Kind | What it does | Auth effect |
| --- | --- | --- | --- |
| `createClient` (browser) | client (`client.ts`) | Browser Supabase client from `@supabase/ssr` | Carries the user's session in the browser; used by the sign-in button |
| `createClient` (server) | server helper (`server.ts`) | Server Supabase client wired to Next `cookies()` | Reads/refreshes the session cookie server-side; the user-scoped client for RLS |
| `updateSession` | middleware (`middleware.ts`) | Refreshes the token; redirects unauthenticated protected requests to `/` | Keeps the session fresh; first line of route protection |
| `/auth/callback` | route handler | `exchangeCodeForSession(code)` then redirect to `/` | Creates the session cookie after Google consent |
| Continue-with-Google button | client action | `signInWithOAuth({ provider: "google", redirectTo: .../auth/callback })` | Starts the OAuth (PKCE) flow |
| `signOut` | server action | `supabase.auth.signOut()` then `redirect("/")` | Ends the session; returns to the landing |
| `getUser()` gate | server call | Validates the token; returns the current user or gates | The authorization check for authed views and protected routes |

**Key invariants.**
- User data is only ever read or written through a user-scoped client (browser or server), so RLS applies.
- The secret/service key never touches a user data path; it stays for system paths only.
- Server-side auth checks use `getUser()` (validated), never `getSession()` (unvalidated).
- The signed-out landing renders no authed data.
- The middleware matcher is a UX fast-path, not the security boundary. Every authed page, layout, server action, and route handler that touches user data does its OWN server-side `getUser()` check and denies/redirects if absent. A route the matcher misses must still be safe.
- `updateSession` returns the same mutated `NextResponse` (redirect branches copy the cookies), so refreshed sessions are never dropped.
- The server client's `setAll` is wrapped in try/catch (Server Components cannot set cookies); middleware persists the refresh.

**Security model.** Supabase Auth owns identity. Sessions are httpOnly cookies managed by `@supabase/ssr`, so client scripts cannot read the token. RLS scopes every profile row to `auth.uid()`. `getUser()` validates the token server-side on every gate. This is standard user auth, not a special compliance scope; the PII in play is the account email plus the Google profile (name, avatar), kept private per user by RLS. Two rules are load-bearing and non-negotiable: (1) gate with `getUser()`, never `getSession()`; (2) never use the secret key on a user data path (the auth clients here are the user-scoped ones).

**Configuration required.** No new app env vars. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` already exist in `.env.local`; Google's client id and secret live in Supabase, not the app. Install `@supabase/ssr`. REQUIRED external setup (a prerequisite for sign-in to work at all): enable the Google provider in the Supabase dashboard, add the Google OAuth client id and secret (created in the Google Cloud Console), and configure the redirect URLs (the Supabase auth callback URL, and the app's `/auth/callback`). The engineer does this dashboard plus Google Cloud setup; the build cannot complete end-to-end sign-in without it.

**Critical test scenarios (each maps to an AC).**
- Sign in with Google end to end: click "Continue with Google", consent, land authenticated on `/` showing the app home. (AC-1)
- First sign-in: a `profiles` row is created with `display_name` and `avatar_url` populated from the Google identity. (AC-2)
- Reload while signed in: the session persists; still authed after a hard refresh. (AC-3)
- Adaptive `/`: signed-out shows the landing with the sign-in button; signed-in shows the app home in the AppShell with the UserMenu showing the user's name/avatar. (AC-4)
- Sign out: from the UserMenu returns to the public landing; a protected route is then no longer accessible. (AC-5, AC-6)
- Protected server route with no session redirects to `/`; reads go through the user-scoped client so a user sees only their own rows. (AC-6)

## Build plan

Migration first, then an end-to-end tracer bullet slice. The Google dashboard config (see Follow-up) is a prerequisite for steps 3 and 6 to pass.

1. Migration: update `handle_new_user` (create or replace, `SECURITY DEFINER`, `set search_path = ''`) to copy `display_name` and `avatar_url` from `raw_user_meta_data`; apply and confirm live. — AC-2
2. Install `@supabase/ssr`. Build the browser client (`src/lib/supabase/client.ts`), the server client (`src/lib/supabase/server.ts`), and `src/middleware.ts` (`updateSession`: refresh token, redirect unauthenticated protected requests to `/`, with the matcher above). — AC-3, AC-7, AC-6
3. OAuth: the "Continue with Google" client button (`signInWithOAuth`, `redirectTo` `/auth/callback`) and the callback route handler `src/app/auth/callback/route.ts` (`exchangeCodeForSession` then redirect `/`). — AC-1
4. The adaptive `/` (`src/app/page.tsx`): signed-out landing (Reel wordmark, tagline, the Google button) versus signed-in app home inside the AppShell; gate the authed view with `getUser()`. — AC-1, AC-4
5. Sign out: the `signOut()` server action (`src/app/auth/actions.ts`, `signOut()` then redirect `/`) wired to the AppShell UserMenu, which shows the user's name and avatar from the `getUser()` metadata. — AC-5
6. Apply and verify end to end: sign in, profile populated, reload persists, sign out returns to the landing, a protected route redirects. — all ACs

## Consequences

**Positive.**
- The app has a real, secure account system: httpOnly cookie sessions, validated server-side, with RLS scoping every user to their own rows.
- The user-scoped browser and server clients are in place, so every later feature (feed, watchlist, import) reads and writes user data the same correct way.
- Google-only removes password reset and email confirmation from the MVP; less to build and secure.
- Defense in depth on protected routes (middleware plus a server-side `getUser()` check) means a single missed check does not open a hole.
- The profile is populated atomically by the trigger on first sign-in; no fragile client write.

**Negative.**
- Google-only excludes anyone without a Google account until email/password is added.
- The adaptive `/` needs careful gating; a mistake there is how authed data would leak, so the `getUser()` gate on the authed branch is load-bearing.
- The Google OAuth config (Supabase dashboard plus Google Cloud Console, redirect URLs) is an external manual prerequisite; the code cannot sign anyone in until it is done.
- `getUser()` adds a network round trip per gate versus trusting the cookie. Worth it for correctness.
- Middleware runs on every matched request (small, constant cost).

**Neutral.**
- Sessions are cookies, so the token is not readable by client JS; features that need user context on the client read it through the browser Supabase client, not from storage.
- The service client stays for system paths only; this feature does not change it.

## Follow-up

- [ ] Email + password (and password reset) as a second sign-in method if non-Google users need access.
- [ ] Configure Google OAuth in the Supabase dashboard + Google Cloud Console (redirect URLs) — required before end-to-end sign-in works.
- [ ] Post-login routing: send new users (no taste profile / `onboarding_completed` false) to onboarding and returning users to the feed, once those features exist.
- [ ] (optional) A Supabase conventions skill is not installed; consider adding one for later Supabase work.
