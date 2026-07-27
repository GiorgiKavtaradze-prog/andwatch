# Verify: Movie catalog & validation · ADR 0003 · updated 2026-07-04
_Steps derived from ADR 0003 acceptance criteria. `/verify` runs these; `/test` locks the durable ones._
_All steps below were confirmed live at build time against real TMDB and the cloud database._

## Commands (run with real env: `tsx --env-file=.env.local <script>`)
- [x] Query the DB: `movies` has imdb_id (unique index), directors, top_cast, keywords, vote_average, vote_count, popularity, synced_at, plus the popularity index → AC-1
- [x] `resolveByTmdbId(27205)` → caches and returns Inception with director, cast, keywords, imdb_id, popularity; a second call reads from cache → AC-3
- [x] `resolveByImdbId('tt1375666')` → exact match to Inception (id 27205) → AC-4
- [x] `resolveByTitleYear('The Matrix', 1999)` → matches id 603 → AC-4
- [x] `resolveByTmdbId(999999999)` and `resolveByTitleYear('<fake title>', 2011)` → both return `no-match`; nothing written to movies → AC-3, AC-4 (fails closed)
- [x] `validateMovieIds([27205, 603, 999999999])` → existing [27205, 603], missing [999999999] → AC-5
- [x] `getCandidates({ limit: N })` → returns only real cached rows (synced_at not null), ordered by popularity → AC-5
- [x] `npm run seed:movies` (optionally `SEED_PAGES=1`) → populates the catalog, re-runnable with no duplicates → AC-6

## Structural / manual
- [x] Movie writes go only through the service client (secret key); RLS keeps `movies` read-only for users (ADR 0002); the TMDB token and secret key are server-only, never shipped to the browser → AC-7
- [x] `src/lib/tmdb/attribution.ts` holds the required TMDB attribution text, logo URL, and link; movie-rendering features must display them → AC-8
- [ ] Behavioral (when import lands): `resolveMany(refs)` resolves a chunk through one shared rate budget, returning a per-ref matched/no-match result → AC-9

## Acceptance-criteria coverage
- AC-1 (schema live) → confirmed · AC-2 (TMDB client + rate limit/backoff) → confirmed via smoke + seed · AC-3 (cache-through, fail closed) → confirmed · AC-4 (import resolution) → confirmed · AC-5 (validation + candidates) → confirmed · AC-6 (seed idempotent) → confirmed · AC-7 (service-only writes, server-only keys) → structural · AC-8 (attribution documented) → confirmed · AC-9 (batch resolve) → built, exercised fully when the import feature lands
