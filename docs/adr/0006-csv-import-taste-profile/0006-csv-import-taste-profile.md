# 0006. CSV import and taste profile for Reel

**Date**: 2026-07-05
**Status**: Accepted

## Summary

This decides how a signed-in user turns a Letterboxd or IMDb ratings export into a taste profile the recommendation engine can match on. A user uploads a CSV, we parse it in the browser, POST the structured rows to the server, and process them in resumable bounded chunks: each row is normalized to a 0 to 100 rating and resolved to a real catalog movie through feature 4's resolver, then embedded. When at least 20 movies match, we compute one taste vector (a rating-weighted average of the matched movies' embeddings) and store it in `taste_profiles.vector`. To build it we add two nullable vector columns with an HNSW index, an OpenAI embeddings client, the movie-embedding step at write time, the chunked import server action, the taste-vector math, and the import UI.

## Context

> ⚠️ Premise note: five real concerns to name before building, none of them blockers.
>
> 1. The hard floor of 20 matched ratings denies a genuine small-library user any profile. A real Letterboxd user with 12 rated films gets nothing from import and is routed to onboarding. This is a deliberate quality trade (a 12-film vector is noisy), but it is a real cost, so 20 is a named tunable constant and the below-floor path is a first-class UI state, not an error.
> 2. Feature 4's TMDB rate limiter is in-process only (from ADR 0003). It bounds calls within one serverless invocation, not across concurrent ones. Several imports running at once, or one user's import racing the seed, can collectively exceed TMDB's free-tier budget. The 429 backoff absorbs this without data loss, but it is a live ceiling. We keep imports to bounded chunks and lean on that backoff; a shared limiter stays a follow-up.
> 3. A large cold import is slow and costs money. Every uncached movie is one TMDB round trip plus its share of an OpenAI embeddings call. A first-time 2,000-row import from a user whose films are mostly outside the seed is minutes of work and real spend. Chunking across requests is what keeps any single request inside the Vercel duration limit; cost is bounded by the fact that already-cached movies (and already-embedded ones) are free on re-resolve.
> 4. Zero-variance ratings collapse the centroid. If a user rated every film the same score, every centered weight is about zero and the weighted sum vanishes, so there is no vector to normalize. This is a named, load-bearing fallback (plain mean of the unit embeddings), not an afterthought.
> 5. Client-parsed rows mean a closed tab loses in-flight progress. Because the browser parses the file and streams rows to the server, closing the tab mid-import stops the driver. The already-ingested ratings are durable (they upsert as chunks complete), but "resume" for a not-yet-finished import means the user re-uploads the same file. Re-processing is idempotent, so re-upload is safe and cheap (cached movies do not re-hit TMDB). We surface this honestly rather than promising server-side resume the MVP does not have.
>
> Assumption carried: feature 6 (accounts and auth) lands the user-scoped Supabase clients and `getUser()` gate this feature reads and writes user data through. It is in-progress on the roadmap; this feature depends on it.

The problem is concrete. A film lover arrives with years of ratings already recorded on Letterboxd or IMDb. We want to convert that history into an instant taste profile so their first session ends on a real, personal recommendation feed (feature 8), not an empty state. The taste profile is the core asset the whole product is built to produce, and this feature produces the first one.

The product promise sets the bar. Reel matches on themes, pacing, cinematography, and emotional arc, not on genre tags. A profile built only from "likes action, dislikes romance" cannot deliver that. The signal has to come from a semantic representation of each movie (an embedding, a list of numbers that places similar movies near each other), aggregated across everything the user rated, so the resulting vector captures the shape of their taste rather than a handful of category counts.

This feature is bound by four decisions ADR 0001 explicitly handed to it, and it must honor all four: (a) pick the embeddings model, (b) choose and tune the pgvector index type, (c) set the concrete row threshold where synchronous parsing gives way to chunked processing, and (d) provide a retry, resume, and idempotency story so an import never leaves a half-built profile. ADR 0001 flagged (d) as a correctness requirement, not just a scaling one: a 2,000-row import that fails halfway must not silently hand the user half a taste profile.

It also reuses feature 4's catalog resolver rather than reinventing it. ADR 0003 built `resolveMany(refs[])` (resolve a chunk of references through one shared TMDB rate budget, returning matched-or-no-match per reference), `resolveByImdbId`, `resolveByTitleYear`, `getCandidates`, and `validateMovieIds`, plus the fail-closed rule that an unresolvable reference returns `no-match` and never a fabricated movie. ADR 0002 already shaped the `imports`, `ratings`, and `taste_profiles` tables for this feature and deliberately deferred the two vector columns to it as a plain additive migration. This feature stands on all of that; it does not re-decide it.

## Requirements

**User stories**

- As a returning film lover, I want to upload my Letterboxd or IMDb ratings export so that I get an instant taste profile without re-rating anything.
- As a user, I want the app to tell me which of my rows it could not match so that I trust it is not silently dropping my history.
- As a user, I want a failed or interrupted import to pick up where it left off (or be safe to re-run) so that I never end up with a duplicated or half-built profile.
- As a user with a small ratings history, I want a clear explanation and a next step when my import is too small to build a profile, so that I am not left at a dead end.
- As a user who imports again later, I want the new ratings merged with my existing ones so that my profile reflects everything I have rated.

**Acceptance criteria**

- **AC-1**: A migration adds `movies.embedding vector(1536)` (nullable) with an HNSW cosine index (`vector_cosine_ops`), and `taste_profiles.vector vector(1536)` (nullable), applied and confirmed live. No other schema change (ratings, imports, and taste_profiles were already shaped by ADR 0002).
- **AC-2**: A signed-in user can upload a Letterboxd or IMDb ratings CSV; the source is auto-detected from the header columns (the user can correct it). Only movie rows are imported; IMDb TV and episode rows are skipped and surfaced as skipped, not matched.
- **AC-3**: Each row's rating is normalized to 0 to 100 (Letterboxd 0.5 to 5, IMDb 1 to 10) with `raw_value` and `raw_scale` retained; rows resolve to real catalog movies via the feature 4 resolver (IMDb id exact for IMDb exports, normalized title plus year for Letterboxd); an unresolved row is recorded in `imports.unmatched` (never dropped, never guessed).
- **AC-4**: The import runs in resumable bounded chunks: `imports.status` and the matched and unmatched counts advance as chunks complete. A chunk that fails is retried with backoff; if it still fails the import is marked `failed` with the error and ALL already-ingested rows are kept; re-running resumes idempotently (ratings upsert on the unique `(user_id, movie_id)`). The taste vector is computed ONLY after all rows succeed, never a half-built profile.
- **AC-5**: Movies are embedded by the import pipeline and the seed, not by the shared catalog resolver (the resolver stays factual-only so a feed-triggered cold cache-through never blocks on an OpenAI call, honoring ADR 0003's hot-path boundary): the import chunk embeds the movies it just cached, the seed embeds what it inserts, and a one-time backfill embeds rows seeded before this feature (and any movie left with a null embedding). A movie with no embedding is excluded from matching, never fabricated.
- **AC-6**: When at least 20 movies match, the taste profile is computed as a rating-weighted centroid (each rating centered on the user's average, the summed weighted unit-vectors normalized to unit length) and written to `taste_profiles.vector`, with `rating_count` and `computed_at` set; `genre_affinities` is also filled as the cheap early non-vector cache.
- **AC-7**: When fewer than 20 movies match (the tunable floor), no vector is written; the UI explains "matched N, need 20" and offers the onboarding path; the ratings are still saved so a later import or onboarding can cross the floor.
- **AC-8**: A re-import merges: new rows upsert (latest wins per movie) and the taste vector is recomputed from all of the user's ratings (every source).
- **AC-9**: The import screen shows drag and drop upload, source auto-detect, live progress, the matched, unmatched, and skipped counts, and the unmatched list (title, year, rating); no manual re-matching in the MVP. It renders idle, parsing, processing, done, below-floor, and error states.
- **AC-10**: All embedding generation and all movie and embedding writes run server-side through the service path; `OPENAI_API_KEY` and the TMDB token are server-only and validated at startup; the user's ratings, imports, and taste_profiles are read and written through the user-scoped RLS client (never the service key on a user data path).

## Options considered

### Option 1 (chosen): rating-weighted embedding centroid, built by a chunked resumable pipeline

Embed every catalog movie from its cached metadata. For a user, take the embeddings of the movies they rated, weight each by how far the rating sits above or below the user's own average, sum the weighted unit-vectors, and normalize the result to one taste vector. Build it by processing the CSV in bounded chunks across requests, resolving each chunk through feature 4's `resolveMany`, upserting ratings idempotently, and computing the vector only after every row has been processed.

- Pro: the taste vector captures semantic similarity (theme, tone, pacing), which is exactly the "not genre tags" promise the product is built on. Matching is one pgvector query against `movies.embedding`.
- Pro: chunked and resumable satisfies ADR 0001's correctness requirement directly. No single request risks the duration limit, a mid-import failure keeps its rows, and re-running is safe.
- Con: the most moving parts of the three options (an embeddings vendor, a vector column and index, the chunk driver, the centroid math). It is also the only option with a real per-import cost and latency for cold movies.

### Option 2: genre-affinity-only profile, no embeddings

Skip embeddings entirely. Build the profile as weighted genre counts over the movies the user liked, and match by overlapping genres and popularity (essentially feature 4's `getCandidates` database filter).

- Pro: by far the simplest. No new vendor, no vector column, no index tuning, no embedding cost. It ships in a fraction of the time.
- Con: it fails the core product promise. Genre counts cannot express "slow-burn character studies with warm cinematography." Recommendations would be real but coarse, which is exactly the mediocre-but-real outcome ADR 0003's premise note said the vectors exist to fix. This is a dead end for the product's central value, not a smaller version of it.

### Option 3: rating-weighted embedding centroid, but a fully synchronous in-request import

Same taste representation as Option 1, but parse and process the whole CSV inside one server request: resolve every row, embed every cold movie, compute the vector, all before responding.

- Pro: the simplest processing shape. No chunk state machine, no cross-request progress, no resume logic. One request in, one profile out.
- Con: it walks straight into the partial-failure and timeout risk ADR 0001 named. A few-thousand-row cold import, each row a TMDB round trip plus an embedding, can approach or exceed the Vercel 300 second duration limit, and a failure at row 1,900 either loses everything or leaves a half-built profile. ADR 0001 explicitly required this feature to avoid that.

## Decision

**Chosen option**: Option 1: a rating-weighted embedding centroid taste profile, built by a chunked, resumable, idempotent import pipeline that reuses feature 4's resolver and computes the vector only after all rows succeed.

The RECOMMEND picks, each with a one-line why and its runner-up:

1. **CSV parsing: Papa Parse, in the browser.** It is the boring, battle-tested CSV parser and it handles the quoting, embedded commas, and header rows that real Letterboxd and IMDb exports contain; parsing client-side keeps the file off our servers (no file storage, per ADR 0001 scope) and lets header detection run before anything is POSTed. Runner-up: a hand-rolled split-on-comma parser (one less dependency, but it breaks on any quoted comma in a film title, which is common).
2. **Rating normalization: fixed linear map, raw retained.** Letterboxd `round(raw / 5 * 100)` with `raw_scale = '0.5-5'`; IMDb `round(raw / 10 * 100)` with `raw_scale = '1-10'`. Store `raw_value` and `raw_scale` alongside `normalized_value` so a better normalization can be recomputed later from the source of truth. Runner-up: percentile or z-score normalization per user (adapts to raters who cluster high, but is not reversible from stored data and is over-engineered for the MVP).
3. **Centering and aggregation, with the degenerate fallback named.** `weight_i = normalized_i − mean(normalized over the user's rated set)`; `user_vector = normalize(Σ_i weight_i · unit(embedding_i))`. When the ratings have near-zero variance (every score the same, so every weight is about zero and the sum collapses toward the zero vector), fall back to the plain mean of the unit embeddings, `normalize(Σ_i unit(embedding_i))`, so a profile is still produced. This fallback is load-bearing: without it a user who rated everything 5 stars gets no vector. Runner-up: liked-only mean (drop below-average films) (simpler, but throws away the signal that disliked films should push the vector away).
4. **Store movie embeddings L2-normalized.** Normalize each embedding to unit length before storing, so cosine distance equals inner product and the aggregation math works on clean unit-vectors. Use `vector_cosine_ops` for the index regardless, so a stray un-normalized row can never silently corrupt ranking. Runner-up: store raw embeddings and normalize at query time (one fewer write-time step, but repeats work on every read and invites inconsistency).
5. **Chunk size 100 rows; the synchronous-to-chunked threshold is one chunk.** Process 100 rows per server call. Any import larger than one chunk (100 rows) is driven across multiple calls, so we never rely on a single synchronous pass for a real export. This is the concrete threshold ADR 0001 asked this ADR to set. The far revisit point (file storage plus a background queue) stays around the 10,000-plus row range ADR 0001 named. Runner-up: 250 rows per chunk (fewer round trips, but a cold chunk of 250 uncached movies risks the duration limit under the in-process rate limiter).
6. **HNSW with `m = 16`, `ef_construction = 64`, runtime `ef_search = 40` to start.** These are pgvector's defaults and a sound starting point for a catalog of tens of thousands of movies; 1536 dimensions is within pgvector's 2,000-dimension HNSW limit (basis: pgvector README). Tune `ef_search` up if a recall check shows misses. Runner-up: IVFFlat (faster build, but needs a representative training set for its `lists` and degrades as the catalog grows, which HNSW does not).
7. **OpenAI embeddings via the official `openai` SDK, batched.** Use `text-embedding-3-small` at its default 1536 dimensions; send many movie documents in one request (the API accepts an array of inputs) to cut calls and cost. The SDK gives typed requests, retries, and error shapes for one small dependency. Runner-up: direct `fetch` (no dependency, but we would re-implement retry and typing that the SDK already ships). (basis: OpenAI embeddings guide confirms 1536 default dims, the `dimensions` shortening parameter, and array/batch input.)
8. **Chunk retry: 3 attempts, exponential backoff with jitter (about 0.5s, 1s, 2s).** A transient TMDB or OpenAI hiccup usually clears within a couple of seconds; three tries is enough to ride it out without stalling the import. After the third failure the chunk (and the import) is marked `failed` with the error, rows already ingested kept. Runner-up: five attempts (marginally more resilient, but pushes a failing chunk closer to the request duration limit).
9. **Error handling: reuse the project's discriminated-union result shape.** Import and chunk operations return a tagged result in the same style as catalog's `ResolveResult` (`{ status: 'matched' | 'no-match' }`), so callers branch on one consistent shape rather than a new convention per file. Runner-up: throw-and-catch everywhere (familiar, but loses the typed per-row outcome the unmatched list needs).
10. **`genre_affinities`: weighted genre counts over liked movies.** For each movie with an above-average rating, add its weight to each of its genres; store the normalized map. It is the cheap early non-vector cache that feeds `getCandidates`' database-filter fallback and gives the feed something usable the instant the profile exists. Runner-up: skip it for the MVP (one less thing to compute, but leaves the database-filter path with no per-user signal at all).

The 20-rating cold-start floor is a named tunable constant, `MIN_RATINGS_FOR_PROFILE = 20`.

## Rationale

The load-bearing force is the product promise. Reel exists to match on themes, pacing, and feel, not genre tags, and only a semantic representation of each movie can carry that. That is why Option 2 is rejected despite being far simpler: a genre-count profile is a different, weaker product, and ADR 0003's premise note already named vectors as the fix for the coarse early recommendations. The taste vector is a derived value, and the project rule is to not store a derived value without a measured need, but this one clears that bar plainly: it is expensive to compute (an embedding per rated movie) and model-dependent, so recomputing it on every feed render is out of the question. Caching it in `taste_profiles.vector` is the justified exception (basis: ADR 0002's same reasoning for allowing `genre_affinities` as a cache).

The processing shape is decided by ADR 0001's four owed items and its serverless duration limit. A cold import bundles three fragile legs (resolve against TMDB, embed against OpenAI, write) over potentially thousands of rows, and the Vercel default duration is 300 seconds (basis: Vercel duration docs). A synchronous import (Option 3) can exceed that and, worse, can fail halfway and leave a half-built profile, which ADR 0001 called out as a correctness requirement, not just a scaling one. Chunking across requests fixes both: each call does bounded work (100 rows), progress is durable in `imports`, ratings upsert idempotently on `(user_id, movie_id)`, and the vector is computed only after the final chunk. The reuse of feature 4's `resolveMany` is deliberate: it already batches a chunk through one shared TMDB rate budget, so the import does not race TMDB row by row. The honest limit, carried from ADR 0003, is that the TMDB rate limiter is in-process, so concurrent imports can collectively overrun the free-tier budget; the 429 backoff absorbs it and a shared limiter is a follow-up, not MVP work.

On the embeddings vendor: embeddings are a separate job from what Claude does. Anthropic ships no first-party embeddings model (basis: ADR 0001), so parsing vibe queries and writing reasons (Claude's jobs) and turning a movie into a vector (an embeddings model's job) are genuinely different tools. We pick OpenAI `text-embedding-3-small` at 1536 dimensions because it is cheap, widely used, well documented, and its dimension fits pgvector's HNSW limit with room to spare (basis: OpenAI embeddings guide; pgvector README). This does add a fourth AI vendor and a new key. Whether to consolidate onto a single vendor by also moving the LLM work to OpenAI is a separate decision, and it is not made here; it is owned by feature 8 and ADR 0001 as a follow-up. The small-team, ship-fast force is served by leaning on the official SDK, batching inputs to cut cost and calls, and embedding at write time so the expensive step happens once per movie and is free forever after.

## Feature design

### Data model sketch

Two nullable columns added by an additive migration (the shape ADR 0002 deferred to this feature):

- `movies.embedding vector(1536)`, nullable. Null means not yet embedded; such a movie is excluded from matching, never fabricated. Stored L2-normalized (unit length). Indexed:
  `CREATE INDEX ON movies USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);`
- `taste_profiles.vector vector(1536)`, nullable. Null means no profile yet (below the floor, or not computed). Also stored unit length.

Nothing else changes. `ratings`, `imports`, and `taste_profiles` keep the columns, constraints, RLS, and state machine from ADR 0002. `movies` keeps its feature 4 columns.

**Embed-text document (per movie).** Compose one plain-text document per movie from the metadata feature 4 already caches: `overview`, `keywords` (names), `genres` (names), `directors` (names), and `top_cast` (names). No hand-tagging, no extra Claude call. A movie with an empty document (no overview and no tags) is left with a null embedding and excluded from matching.

**Centroid math.** For the user's rated, matched, embedded movies:
- `mean = average(normalized_value over the set)`
- `weight_i = normalized_i − mean`
- `raw = Σ_i weight_i · unit(embedding_i)`
- if the ratings carry real variance and the sum has direction (population standard deviation of `normalized_value` across the set is at least 1.0 on the 0 to 100 scale, AND `‖raw‖ ≥ 1e-6`): `user_vector = raw / ‖raw‖`
- else (zero-variance fallback): `user_vector = normalize(Σ_i unit(embedding_i))` (plain mean of the unit embeddings). The two concrete triggers are: every rating effectively equal (stddev below 1.0), or the weighted sum collapses toward the zero vector (`‖raw‖ < 1e-6`).

### State transitions

`imports.status` follows the ADR 0002 machine, one direction, settling at a terminal state:

```
pending ──▶ processing ──▶ completed
                  │
                  └────────▶ failed
```

`createImport` writes the row as `pending`. The first chunk moves it to `processing`. Each completed chunk advances `matched_rows`, `unmatched_rows`, and appends to `unmatched`. When the last chunk completes and the floor is met, the taste vector is computed and the import settles at `completed`; below the floor it still settles at `completed` (ratings saved, no vector). A chunk that fails all its retries settles the import at `failed` with `error` set, all already-ingested rows kept. Re-running an import re-applies its rows idempotently (ratings upsert on `(user_id, movie_id)`), so a `failed` import can be finished by re-driving it. Re-driving reuses the SAME `imports` row (the failed import's id): the import screen offers a resume action on a `failed` import that re-drives its id from a re-selected file, and `createImport` is only for a brand-new upload. So one user retry does not leave an orphan duplicate import row (a permanently-`failed` row next to a new `completed` one).

### API surface

Internal server functions and server actions, not public REST endpoints. User data goes through the user-scoped RLS client; movie and embedding writes go through the service path (per ADR 0003).

| Function | Module | Key inputs | Key outputs | Auth path | Key errors |
| --- | --- | --- | --- | --- | --- |
| `createImport` | server action, `src/app/import` | source, total_rows | import id | user-scoped (RLS), gated by `getUser()` | not signed in; invalid source |
| `processImportChunk` | server action, `src/app/import` | import id, row batch (max 100 normalized rows) | chunk result: matched, unmatched, skipped counts + new status | user-scoped for ratings/imports; service path for movie + embedding writes | chunk fails after 3 retries → import `failed` |
| `getImportStatus` | server action, `src/app/import` | import id | status, counts, unmatched list | user-scoped (RLS) | not owner (RLS returns nothing) |
| `computeTasteProfile` | `src/lib/taste` | user id | vector written or below-floor result | user-scoped read of ratings; user-scoped write of taste_profiles | fewer than 20 matched → no vector, below-floor result |
| `embedMovies` | `src/lib/embeddings` | movie rows (or ids) | embeddings written to `movies.embedding` | service path (SUPABASE_SECRET_KEY) | OpenAI error → retried; movie left null on persistent failure |
| `backfillEmbeddings` | script, `scripts/` | (none; reads un-embedded movies) | count embedded | service path | logs and continues per batch; exits non-zero on fatal config error |

`processImportChunk` is the driver's unit of work: normalize the batch, hand its references to `resolveMany` (feature 4), upsert the matched rows into `ratings`, embed the newly-matched movies that still have a null embedding (via `embedMovies`, the single embedding call site on the import path), record no-match rows into `imports.unmatched`, and advance the counts. The client calls it in a loop, one chunk at a time, until the import reports a terminal status.

`resolveMany` returns `Array<{ ref: MovieRef; result: ResolveResult }>` (order-preserving, one entry per input reference; the matched movie is nested at `.result.movie` when `.result.status === 'matched'`, else `.result.status === 'no-match'`). The returned `Movie` already carries `overview`, `keywords`, `genres`, `directors`, and `top_cast`, so the embed-text document is built straight from it with no extra fetch. The resolver has already upserted the movie row through the service client before returning, so the chunk only adds the embedding write, never the base movie write.

### Key invariants

- Never a half-built profile: the taste vector is written only after every row has been processed and only when `rating_count ≥ MIN_RATINGS_FOR_PROFILE`.
- Ratings upsert is idempotent on `(user_id, movie_id)`; re-running an import never duplicates a rating.
- Embeddings and movie writes happen only through the service path; a user path never writes `movies` or `movies.embedding`.
- A movie with no embedding is excluded from matching, never fabricated. A CSV row that does not resolve is recorded in `imports.unmatched`, never guessed.
- Every movie the app surfaces is a real catalog row (feature 4's guarantee, unchanged).

### Security model

Ratings, imports, and taste_profiles are user-owned: read and write them through the user-scoped Supabase client so RLS runs, and gate every server action with `getUser()` (per `src/lib/supabase/AGENTS.md`). Movie rows and their embeddings are shared, system-owned data: write them through the service client with `SUPABASE_SECRET_KEY`, the same legitimate system path ADR 0003 uses for the catalog. `OPENAI_API_KEY` and the TMDB token are server-only and validated at startup; neither reaches the browser. This is per-user data isolation (a user's own ratings and account email), not a regulated-data compliance scope.

### Configuration required

- `OPENAI_API_KEY` (server-only, validated at startup): the OpenAI embeddings key. Add it to `src/lib/env.ts` alongside the existing required vars, and to `.env.example`.
- Already present: `SUPABASE_SECRET_KEY`, `TMDB_API_READ_ACCESS_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `ANTHROPIC_API_KEY`.

### Critical test scenarios

- Happy path (AC-2, AC-3, AC-6): upload a real Letterboxd export of 30-plus rows; rows normalize, resolve, embed; a taste vector is written with `rating_count` and `computed_at` set. Verifies the whole thread.
- Resumable partial failure (AC-4): force a chunk to fail all retries; the import is `failed`, already-ingested ratings are present, no vector was written; re-driving the import completes it with no duplicate ratings.
- Below floor (AC-7): upload an export where only 12 rows match; no vector is written, the ratings are saved, the UI shows "matched 12, need 20" and offers onboarding.
- Re-import merge (AC-8): after a completed import, upload a second export; overlapping movies upsert (latest wins), the vector is recomputed from all ratings across sources.
- Unmatched recorded (AC-3): include a misspelled or non-existent title and an IMDb TV row; the bad title lands in `imports.unmatched`, the TV row is surfaced as skipped, neither is guessed.
- Auth and permission (AC-10): a user cannot write `movies` or `movies.embedding` through any user path; a user cannot read another user's import status (RLS returns nothing); `OPENAI_API_KEY` and the TMDB token are never exposed to the browser.

## Build plan

Tracer Bullet: stand up the end-to-end thread (upload → chunked processing → taste vector), migration first. Every task tags the AC(s) it satisfies.

1. **Migration** (task 1, stays early): add `movies.embedding vector(1536)` nullable with the HNSW `vector_cosine_ops` index (`m = 16, ef_construction = 64`), and `taste_profiles.vector vector(1536)` nullable. Enable the `vector` extension if not already on. Apply and confirm live. (AC-1)
2. **Embeddings client** in `src/lib/embeddings`: install the `openai` SDK; `embedMovies` composes the per-movie document (overview + keywords + genres + directors + top_cast), calls `text-embedding-3-small` with a batched array input, L2-normalizes each vector, and writes `movies.embedding` through the service client. Add `OPENAI_API_KEY` to `src/lib/env.ts` (validated at startup) and `.env.example`. (AC-5, AC-10)
3. **Movie embedding on the import and seed paths, not in the shared resolver**: keep the shared catalog resolver factual-only (no OpenAI call on cache-through, so a feed-triggered cold resolve never blocks on embeddings, honoring ADR 0003's hot-path boundary). Call `embedMovies` explicitly from the import chunk (on the movies `resolveMany` just cached) and from the seed script; add `scripts/backfill-embeddings.ts` (via `tsx`, an npm script) to embed rows seeded before this feature and any movie left with a null embedding. (AC-5)
4. **CSV parse and source auto-detect (client)**: add Papa Parse; parse the file in the browser, detect Letterboxd vs IMDb from the header columns (user can correct), map rows to `{ title, year, imdbId?, rawValue, isMovie }`, skipping IMDb TV and episode rows as skipped. (AC-2)
5. **Chunked import server action(s)** in `src/app/import`: `createImport`, `processImportChunk` (normalize the batch → `resolveMany` → upsert `ratings` → embed newly-cached movies → append `imports.unmatched` → advance status and counts, with 3-attempt backoff retry and idempotent upsert), and `getImportStatus`. Use the discriminated-union result shape. (AC-3, AC-4)
6. **Taste-vector computation** in `src/lib/taste`: `computeTasteProfile` reads the user's matched, embedded ratings; if `rating_count ≥ MIN_RATINGS_FOR_PROFILE` (20) computes the rating-weighted centroid with the zero-variance fallback, writes `taste_profiles.vector`, `rating_count`, `computed_at`, and the `genre_affinities` cache; else writes no vector and returns a below-floor result. Called by the driver only after the final chunk. (AC-6, AC-7, AC-8)
7. **Import UI** in `src/app/import`: drag and drop upload, source auto-detect with correction, live progress, the matched/unmatched/skipped counts, and the unmatched list (title, year, rating); render idle, parsing, processing, done, below-floor, and error states, built to `design.md` tokens, reusing `PosterImage` and the app shell. Client leaf drives the chunk loop. (AC-9)
8. **Wire end to end**: the page drives create → parse → chunk loop → status, lands on the done state (or below-floor, or error), and (on done) links onward to the feature 8 feed. Confirm the re-import merge path. (AC-2 through AC-9)

Every AC traces to a task: AC-1→1, AC-2→4/7, AC-3→5, AC-4→5, AC-5→2/3, AC-6→6, AC-7→6/7, AC-8→6/8, AC-9→7, AC-10→2/5.

## Consequences

**Positive**

- The taste profile captures semantic similarity, so the feed can match on feel and theme, not genre tags. Matching is one pgvector query.
- The import is correct under failure: chunked, resumable, idempotent, and it never writes a half-built profile. ADR 0001's correctness requirement is met.
- Embedding at write time makes the expensive step a one-time cost per movie; every re-resolve and re-import of a cached, embedded movie is free.
- The pipeline reuses feature 4's resolver and rate budget rather than reinventing catalog logic, and keeps the no-fabrication guarantee intact.
- Storing embeddings unit-normalized keeps the aggregation math clean and makes cosine ranking robust to a stray row.

**Negative (the honest costs)**

- A cold import has real latency and cost: every uncached movie is a TMDB round trip plus its share of an OpenAI embeddings call. A first-time large import from a user outside the seed is minutes of work and real spend.
- The TMDB rate limiter is in-process (from ADR 0003), so concurrent imports can collectively exceed the free-tier budget. The 429 backoff absorbs it without data loss, but it is a live ceiling until a shared limiter lands.
- Because rows are parsed in the browser and streamed to the server, closing the tab mid-import stops the driver; ingested ratings are durable, but resuming a not-yet-finished import means re-uploading the file (safe and cheap, but not a true server-side resume).
- HNSW index build takes memory and time as the catalog grows; fine at tens of thousands of movies, worth watching past that.
- One more AI vendor and key (OpenAI) to hold, secure, and pay, on top of Anthropic, Supabase, and TMDB.
- The hard floor of 20 matched ratings denies a small-library user any import-built profile and routes them to onboarding instead.
- `computeTasteProfile` reads every matched rating's 1536-dimension embedding into the server on each recompute, and AC-8 forces a full recompute from all sources on every re-import, so the cost grows with a power user's rating count. It is fine at MVP scale; aggregating in SQL or on the pgvector side is the optimization if it ever bites.

**Neutral**

- `genre_affinities` is a cached derived value that can go stale between recomputes; readers must treat it as a hint, consistent with ADR 0002.
- The embed-text document is a fixed metadata blend; if recommendation quality needs richer signal later, the document composition can change and a backfill re-embeds, with no schema change.
- The single-vendor question (moving Claude's LLM work to OpenAI too) is deliberately left open here.

## Follow-up

- [ ] The single-vendor OpenAI-LLM question: whether to consolidate the LLM work onto OpenAI as well, owned by feature 8 and ADR 0001, not decided here.
- [ ] A shared or distributed rate limiter (for example Upstash Redis) if concurrent imports grow, so the TMDB budget is enforced across serverless invocations (carried from ADR 0003).
- [ ] A manual unmatched re-matching UI if demand appears (the MVP only surfaces the unmatched list).
- [ ] HNSW recall and `ef_search` tuning against real catalog data once the catalog and query patterns are live.
- [ ] Making `MIN_RATINGS_FOR_PROFILE` configurable (per-environment or admin-tunable) rather than a source constant.
- [ ] The file-storage plus background-job path for very large imports (past roughly the 10,000-plus row range), out of MVP scope per ADR 0001.
- [ ] A Supabase or Next.js conventions skill is not installed; adding one would help keep the migration, RLS, and server-action patterns consistent.

## References

### Project sources

- `docs/adr/0001-stack-and-architecture.md`: the stack; the four decisions owed to this feature (embeddings model, pgvector index and tuning, the synchronous-to-chunked threshold, and the retry/resume/idempotency requirement); the Vercel duration constraint and the synchronous-import risk.
- `docs/adr/0002-data-model/0002-data-model.md`: the `imports`, `ratings`, and `taste_profiles` tables, their state machine, the deferred vector columns, and the derived-value-as-cache reasoning.
- `docs/adr/0003-movie-catalog-validation/0003-movie-catalog-validation.md`: the catalog resolver (`resolveMany`, `resolveByImdbId`, `resolveByTitleYear`, `getCandidates`, `validateMovieIds`), the fail-closed no-match rule, the service-path write rule, and the in-process rate-limiter ceiling.
- `src/lib/catalog/` (`types.ts`, `resolver.ts`, `validation.ts`, `index.ts`): the resolver primitives, the `Movie` shape (overview, keywords, genres, directors, top_cast) this feature embeds, and the `ResolveResult` discriminated-union style reused for import results.
- `src/lib/supabase/AGENTS.md`: the three Supabase clients and the `getUser()` gate.
- `src/lib/env.ts`: the startup env-validation pattern `OPENAI_API_KEY` is added to.
- `docs/roadmap/roadmap.md`: feature 7 (this) and feature 8 (the feed that consumes the taste vector).

### Practices & standards

- Idempotency from day one (upsert on a unique key so re-running is safe).
- Do not store a derived value without a measured need (the taste vector clears this bar: expensive and model-dependent, so it is cached).
- Fail closed at boundaries (an unresolvable row is recorded, never guessed).
- One consistent error shape across the app (the discriminated-union result style).
- Secrets in server-only env, validated at startup; the service key never on a user data path.
- Store vectors unit-normalized so cosine distance equals inner product.

### Links (web verified)

- OpenAI embeddings guide (text-embedding-3-small, 1536 default dimensions, the `dimensions` shortening parameter, array/batch input): https://developers.openai.com/api/docs/guides/embeddings
- pgvector (HNSW with `vector_cosine_ops`, default `m = 16` and `ef_construction = 64`, runtime `ef_search = 40`, the 2,000-dimension HNSW indexing limit that 1536 fits within): https://github.com/pgvector/pgvector
- Vercel function maximum duration (300s default with fluid compute): https://vercel.com/docs/functions/configuring-functions/duration
