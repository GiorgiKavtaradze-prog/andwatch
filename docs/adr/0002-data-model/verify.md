# Verify: Data model · ADR 0002 · updated 2026-07-04
_Steps derived from ADR 0002 acceptance criteria. `/verify` runs these; `/test` locks the durable ones._

## Commands (structural — confirmed at build time)
- [x] Query the DB: 7 tables exist in `public` (profiles, movies, ratings, taste_profiles, watchlist_items, searches, imports) → AC-1
- [x] RLS is enabled on all 7 tables; 23 policies present (movies 1 read-only, profiles 2, others 4 each) → AC-2
- [x] 4 CHECK constraints (ratings.source, imports.source, imports.status, ratings.normalized_value 0 to 100), 2 unique constraints (ratings and watchlist_items per user+movie), 9 foreign keys → AC-1, AC-3, AC-5
- [x] 5 triggers present: 4 `updated_at` triggers + `on_auth_user_created` (SECURITY DEFINER) on auth.users → AC-1
- [x] No vector columns exist yet on movies or taste_profiles (deferred to feature 7) → AC-7

## Behavioral (need auth + data; exercise when auth/import features land)
- [ ] Sign up a user → a `profiles` row is auto-created with the same id → AC-1
- [ ] As user B, attempt to select/update user A's ratings, watchlist, searches → returns nothing / rejected → AC-2
- [ ] Every authenticated user can read `movies`; a user cannot insert/update/delete `movies` → AC-2
- [ ] Insert a rating for (user, movie), then upsert the same pair with a new value → one row, latest value (not two) → AC-3
- [ ] Delete the auth user → all owned rows (ratings, taste_profiles, watchlist_items, searches, imports) are gone, no orphans → AC-4
- [ ] Store a rating with raw_value + raw_scale + normalized_value (0 to 100); store an onboarding swipe with source = onboarding → AC-5
- [ ] Create an import row (status pending → processing → completed/failed), set unmatched rows in `imports.unmatched`, link produced ratings via `ratings.import_id` → AC-6
- [ ] Run a follow-on migration adding a nullable `vector` column to movies and taste_profiles → applies cleanly, no change to existing columns/keys/policies → AC-7

## Acceptance-criteria coverage
- AC-1 (schema live) → structural commands, confirmed · AC-2 (RLS isolation) → structural + behavioral · AC-3 (unique upsert) → structural + behavioral · AC-4 (cascade delete) → behavioral · AC-5 (raw + normalized, onboarding) → structural + behavioral · AC-6 (imports resumable) → behavioral · AC-7 (vectors deferred, non-breaking) → structural + behavioral
