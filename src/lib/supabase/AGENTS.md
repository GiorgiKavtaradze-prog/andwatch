# Supabase clients

Three Supabase clients, each with a strict role. Auth is Google-only via Supabase Auth; sessions are cookies via `@supabase/ssr`. Governed by ADR 0005 (`docs/adr/0005-accounts-auth/`), building on ADR 0001 and ADR 0002.

## The three clients (do not mix them up)

- **`service.ts` (`getServiceClient`)** — uses the Supabase SECRET key, which bypasses row-level security. System paths ONLY (the movie catalog writes to the shared `movies` table). NEVER on a user's own data path.
- **`client.ts` (`createClient`, browser)** — user-scoped, for client components. Carries the signed-in user's session; RLS applies.
- **`server.ts` (`createClient`, server, async)** — user-scoped, for server components, server actions, and route handlers. Reads the session from cookies. Its `setAll` is wrapped in try/catch because Server Components cannot set cookies; the proxy persists the refresh.

For any USER data, use the browser or server client (RLS scopes each user to their own rows). The secret/service key is off-limits on user paths.

## Auth rules (load-bearing)

- **Gate with `getUser()`, never `getSession()`.** `getUser()` validates the token with Supabase; `getSession()` trusts the cookie unvalidated and can be spoofed. Every authed page, layout, server action, and route handler that touches user data calls `getUser()` itself.
- **The proxy matcher is a UX fast-path, not the security boundary.** `src/proxy.ts` (Next 16 renamed middleware to `proxy.ts`, exporting `proxy`) refreshes the session and redirects unauthenticated requests for protected routes to `/`, but the real gate is the per-route `getUser()` check. A route the matcher misses must still be safe.
- **`updateSession` (the proxy) returns the same mutated response.** If it redirects, it copies the refreshed cookies onto the redirect response, or sessions drop at random.

## OAuth flow

Google OAuth (PKCE): the client "Continue with Google" button (`src/components/continue-with-google.tsx`) calls `signInWithOAuth({ provider: "google", redirectTo: <origin>/auth/callback })`; the `/auth/callback` route handler exchanges the code for a session, then redirects to `/`. The root `/` is adaptive (public landing when signed out, app home when signed in). Sign out is a server action (`src/app/auth/actions.ts`). The Google provider credentials live in the Supabase dashboard, not in env vars.
