# Verify: Accounts & auth · ADR 0005 · updated 2026-07-05
_Steps derived from ADR 0005 acceptance criteria. `/verify` runs these; `/test` locks the durable ones._

## Automated (verified at build time)
- [x] `npm run build` → compiles; the proxy is recognized ("ƒ Proxy (Middleware)") → AC-3, AC-6
- [x] `npx tsc --noEmit` clean; `npx biome check src` clean
- [x] `/` (no session) → HTTP 200, renders the landing with a "Continue with Google" button → AC-1
- [x] `/preview` (protected, no session) → 307 redirect to `/` (route protection) → AC-6
- [x] `/auth/callback` (no code) → 307 redirect to `/` (graceful, no leak) → AC-1
- [x] Trigger migration applied: `handle_new_user` replaced to copy display_name + avatar_url from raw_user_meta_data → AC-2 (structural)

## Manual — blocked on Google OAuth config, then run
Prerequisite: enable Google in the Supabase dashboard (Authentication → Providers → Google) with a Google Cloud OAuth client id/secret and the correct redirect URLs (the Supabase callback URL in Google Cloud; `http://localhost:3000/auth/callback` for local dev).
- [ ] Click "Continue with Google" → Google consent → land authenticated on `/` showing the app home in the AppShell (name + avatar in the UserMenu) → AC-1, AC-4
- [ ] First sign-in: a `profiles` row exists with `display_name` and `avatar_url` populated from the Google identity → AC-2
- [ ] Reload while signed in → still signed in (session persists) → AC-3
- [ ] Sign out from the UserMenu → returns to the public landing; a protected route (e.g. `/preview`) then redirects to `/` → AC-5, AC-6
- [ ] A signed-out visitor sees only the landing on `/` (no authed data) → AC-4

## Acceptance-criteria coverage
- AC-1 (Google sign-in → app home) → button + callback built/verified; full roundtrip manual · AC-2 (profile from Google) → migration applied, behavioral manual · AC-3 (cookie session persists) → proxy verified, persistence manual · AC-4 (adaptive /) → signed-out verified, signed-in manual · AC-5 (sign out) → built, manual · AC-6 (protected routes + user-scoped client) → protection verified 307 · AC-7 (browser + server clients) → built and used
