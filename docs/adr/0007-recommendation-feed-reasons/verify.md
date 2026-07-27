# Verify: Recommendation feed with reasons · ADR 0007 · updated 2026-07-05

_Steps derived from ADR 0007 acceptance criteria. `/verify` runs these; `/test` locks the durable ones._

## Prerequisites (operator actions — the feature cannot run without these)

- [ ] Set `ANTHROPIC_API_KEY` in `.env.local` (the app throws at startup without it, by design — server-only, validated in `src/lib/env.ts`).
- [ ] Apply the migration `supabase/migrations/20260705130000_add_recommendations.sql` to the database (no automated apply exists in-repo; use the Supabase SQL editor, or link the CLI and `npx supabase db push`, as with the earlier migrations). It creates the `recommendations` table + RLS and the `match_feed_candidates` / `replace_recommendations` functions.
- [ ] A signed-in user with a computed taste profile (run a real Letterboxd/IMDb import first, per ADR 0006) so the feed has a taste vector to match on.

## Commands

- [ ] `npm run build` → compiles, TypeScript passes, `/feed` listed as a route → AC-8, AC-9
- [ ] `npm test` → 24+ pass (no regression) → AC-3..AC-6
- [ ] Confirm the migration is live: query the DB that table `recommendations` exists with `UNIQUE (user_id, movie_id)`, index `idx_recommendations_user_rank`, RLS enabled, and functions `match_feed_candidates` / `replace_recommendations` are present → AC-1

## UI / manual (signed in with Google)

- [ ] Visit `/feed` while signed out → redirected to `/` (landing) → AC-9
- [ ] Sign in with **no** taste profile, open `/feed` → no-profile state with links to `/import` and `/onboarding`; no query or Claude call runs → AC-7
- [ ] Sign in with a taste profile and ≥10 unseen embedded movies, open `/feed` → skeletons on first load, then up to 10 ranked cards, each with poster, title, and a ~15-word italic reason → AC-2, AC-4, AC-8
- [ ] Confirm ranking follows cosine order with popularity breaking near-ties; a movie the user has rated never appears; a watchlisted-but-unrated movie may appear → AC-3
- [ ] Reload the feed with an unchanged profile → cached rows serve instantly and **no** Anthropic request fires (check network/logs) → AC-5
- [ ] Re-run an import (bumps `taste_profiles.computed_at`), reload `/feed` → the old cards show dimmed while it regenerates, then the new set lands → AC-5
- [ ] Click **Refresh** on a fresh feed → regenerates on demand; the button is disabled with a spinner while in flight → AC-5
- [ ] Force a generation failure (e.g. temporarily bad `ANTHROPIC_API_KEY`) during a refresh → the previous feed stays intact, a toast + retry appear, and no partial set was written; with no prior feed, the error state with a Try-again button shows → AC-6
- [ ] Heavy rater with fewer than 10 unseen matches → exactly the real picks (even 3), no filler; a rater with 0 unseen matches → the thin/no-picks state, and no Claude call fires → AC-7
- [ ] Confirm a second user cannot read the first user's `recommendations` (RLS returns nothing); the feed path never uses the service key; `ANTHROPIC_API_KEY` is never exposed to the browser → AC-9

## Acceptance-criteria coverage

- AC-1 migration/table/index/RLS/functions live · AC-2 up-to-10 real unseen picks · AC-3 cosine + popularity tiebreak, rated excluded · AC-4 Sonnet reason grounded in metadata + taste · AC-5 cached serve, regen on profile change / refresh · AC-6 atomic replace, fail-closed, retry · AC-7 no-profile + thin states · AC-8 all feed states to design.md, reusing recommendation-card · AC-9 server-only keys + user-scoped RLS client
