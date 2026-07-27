# Verify: CSV import & taste profile · ADR 0006 · updated 2026-07-05

_Steps derived from ADR 0006 acceptance criteria. `/verify` runs these; `/test` locks the durable ones._

## Prerequisites (operator actions — the build cannot run without these)

- [ ] Set `OPENAI_API_KEY` in `.env.local` (the app throws at startup without it, by design).
- [ ] Apply the migration `supabase/migrations/20260705120000_add_taste_vectors.sql` to the database (no automated apply exists in-repo; use your Supabase SQL editor, or link the CLI and `npx supabase db push`, as with the earlier migrations).
- [ ] Backfill embeddings for the already-seeded catalog: `npm run backfill:embeddings` (matching needs movies to have vectors).

## Commands

- [ ] `npm run build` → compiles, TypeScript passes, `/import` listed as a route → AC-2..AC-10
- [ ] Confirm the migration is live: query the DB that `movies.embedding` and `taste_profiles.vector` columns exist and the `idx_movies_embedding_hnsw` index is present → AC-1
- [ ] `npm run backfill:embeddings` → logs "embedded N"; then query `select count(*) from movies where embedding is not null` returns > 0 → AC-5

## UI / manual (signed in with Google)

- [ ] Visit `/import` while signed out → redirected to `/` (landing) → AC-10
- [ ] Sign in, open `/import`, drop a real Letterboxd `ratings.csv` → source shows "Letterboxd export detected" with a row count → AC-2
- [ ] Repeat with an IMDb `ratings.csv` (include a TV row) → detected as IMDb; the TV row is counted as skipped, not matched → AC-2
- [ ] Click "Start import" → progress bar advances, matched/unmatched badges update live → AC-3, AC-4
- [ ] On a history with ≥20 matches → ends on "Your profile is ready"; query `taste_profiles` shows a `vector`, `rating_count`, `computed_at`, and `genre_affinities` for your user → AC-6
- [ ] Include a misspelled/obscure title → it appears in the "Not matched" list (nothing dropped silently); query `imports.unmatched` holds it → AC-3
- [ ] On a history with <20 matches → "Almost there, matched N, need 20"; no `taste_profiles.vector` written; ratings still present in `ratings` → AC-7
- [ ] Re-import a second/overlapping export → overlapping movies upsert (no duplicate ratings; unique (user_id, movie_id)); the vector is recomputed from all ratings → AC-8
- [ ] Force a failure mid-import (e.g. temporarily bad `OPENAI_API_KEY`) → import shows "interrupted", already-ingested ratings remain, "Resume import" re-drives the same import id to completion with no duplicates → AC-4
- [ ] Confirm a browser client cannot write `movies`/`movies.embedding` (RLS read-only) and never sees `OPENAI_API_KEY` or the TMDB token → AC-10

## Acceptance-criteria coverage

- AC-1 migration/columns/index · AC-2 upload+detect+skip TV · AC-3 normalize+resolve+unmatched · AC-4 chunked/resumable/idempotent · AC-5 embed at seed/import + backfill · AC-6 centroid profile · AC-7 below-floor route · AC-8 re-import merge · AC-9 UI states · AC-10 server-only keys + RLS split
