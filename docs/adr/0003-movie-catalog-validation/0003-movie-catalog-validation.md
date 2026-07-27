# 0003. Movie catalog population and validation

**Date**: 2026-07-04
**Status**: Accepted

## Summary
This decides how real movies get into the `movies` table and how the app guarantees it never shows a made-up title. We populate the catalog two ways (a re-runnable seed of well-known movies plus cache-through on first reference), we cache the factual TMDB metadata other features read, and we make AI recommendations pick only from real catalog rows (constrained generation) with a backstop that checks every returned id exists. To build it we extend the `movies` table, stand up a server-side TMDB client with a rate limiter, a cache-through resolver that fails closed (no match, never a fake movie), a validation and candidate service, and the seed.

## Context
> ⚠️ Premise note: The no-hallucination guarantee rests on two things working together. The strong half (the AI can only pick from real rows we hand it, plus a post-check that every returned id exists) holds fully in the MVP. The weak half is candidate quality: in the MVP the shortlist we hand the AI comes from plain database filters (genres, keywords, text, popularity ordering), because the taste vectors do not exist yet (they are feature 7's). So early recommendations may be less on-target, but they are always real. Vector retrieval (feature 7 and 10) upgrades quality later without changing the guarantee. Two more real limits to name up front. First, TMDB's free tier is rate limited (about 40 to 50 requests per 10 seconds), so a bulk seed or a large import is bound by that, not by our code, which is why the client must rate-limit and back off. Second, cache-through adds one TMDB round trip the first time a movie is seen, so the resolver belongs on paths where a short delay is fine (import, seed), not blocking a hot page render. With those noted, the confirmed design is sound and I am building it as specified.

The app must only ever show real movies. Two paths bring movie references in: a user's imported ratings history (Letterboxd or IMDb CSV) and the AI's recommendations. Both must land on a real catalog record or be reported as no match. Neither can be allowed to invent a title.

We also cannot call TMDB on every page view. TMDB is the source of truth (decided in ADR 0001), it is rate limited on the free tier, and it requires attribution in the UI. So we cache the factual metadata we need (overview, genres, keywords, cast, directors, ratings, popularity) in our own `movies` table and read from there.

The forces at play: TMDB rate limits and its attribution obligation, a small team shipping an MVP fast, and the hard product promise that every title a user sees is real. The catalog is infrastructure. The import, onboarding, feed, and vibe-search features all depend on it, so it has to be correct and boring before anything is built on top.

Boundary, stated plainly: this feature caches only factual TMDB metadata. The semantic understanding of a movie (its themes, pacing, cinematography, emotional arc) is derived by feature 7's embeddings over that cached text. It is not fetched here and not hand-tagged here. There are no vibe or semantic columns in this feature's schema.

## Requirements

**User stories** (mostly system-facing):
- As the system, I resolve any movie reference (a TMDB id, an IMDb id, or a title with a year) to a real catalog record, or I report no match. I never guess.
- As the system, I cache each movie's factual metadata once so later reads do not hit TMDB.
- As the import feature, I can hand a raw row to a resolution service and get back either a real movie or an unmatched report I can record.
- As the vibe-search feature, I get a shortlist of real catalog movies to constrain AI generation, and a check that every id the AI returns is real.
- As a user, every movie I ever see is a real movie.

**Acceptance criteria**:
- AC-1: The `movies` table is extended with imdb_id (unique), directors, top_cast, keywords, vote_average, vote_count, popularity, synced_at, plus the unique imdb_id index and a popularity index, applied and confirmed live.
- AC-2: A server-side TMDB client can fetch movie details, search by title (with optional year), find by IMDb id, and list popular/top-rated/trending, using a server-only key. It throttles its own calls through an in-process limiter and backs off on 429 / Retry-After. (Known limit, see Consequences: the in-process limiter only bounds calls within a single process or serverless invocation, not across concurrent ones; the 429 backoff is the cross-invocation safety net until a shared limiter is added.)
- AC-9: A batch resolve entry point resolves many references in one call through a single shared rate budget and returns a per-reference result (matched movie or no-match), so the import feature can process a CSV in bounded chunks without each row racing TMDB independently.
- AC-3: The cache-through resolver returns a real catalog movie for a given TMDB id, IMDb id, or title+year: if the movie is missing or a stub (synced_at null), it fetches from TMDB, upserts the full record with synced_at set, and returns it. A reference TMDB cannot resolve returns a clear no-match, never a fabricated movie.
- AC-4: Import resolution uses the IMDb id when present (exact match), else title + year search with year disambiguation; an unresolved row is reported as unmatched (for imports.unmatched), never guessed.
- AC-5: The validation service (a) confirms that every movie id in a given set exists in the catalog (the backstop that guarantees no hallucinated title survives), and (b) provides a candidate-retrieval function that returns only real catalog movies for constrained AI generation.
- AC-6: A re-runnable, idempotent seed script populates a base set of well-known movies (TMDB popular + top-rated + trending) into the catalog with full metadata.
- AC-7: Movie writes happen only through a server/service path using the Supabase secret key; users cannot write movies (RLS read-only for users, from ADR 0002). The TMDB key is server-only and never exposed to the browser.
- AC-8: The TMDB attribution obligation (notice "This product uses the TMDB API but is not endorsed or certified by TMDB", the TMDB logo, and a link back) is documented as a UI requirement for the features that render movies.

## Options considered

**Option 1 (chosen): hybrid population plus constrained generation plus a validation backstop.**
Populate the catalog two ways: a re-runnable seed of several thousand well-known movies, plus cache-through that fetches and stores any movie the first time it is referenced. Prevent hallucination by retrieval-then-generate: retrieve a shortlist of real catalog movies first, let the AI choose and rank only from that set, then post-check that every returned id exists. Con: it is the most moving parts (a TMDB client, a rate limiter, a resolver, a validation and candidate service, a seed), and the resolver adds a TMDB round trip on a cold movie.

**Option 2: validate-after (the AI names movies freely, then we resolve and drop the ones that are not real).**
Simpler to wire because the AI just answers, and we clean up afterward. Con: it is weaker and wasteful. The AI regularly names plausible-sounding movies that do not exist, or real movies not in our catalog, so we would resolve, drop, and re-ask, spending TMDB calls and Claude tokens to recover from hallucinations we could have prevented. Worse, a near-miss (a real title we fail to resolve cleanly) can slip through or force an awkward "we found fewer than we said" result. It treats the guarantee as cleanup instead of a property of the design.

**Option 3: bulk-seed-only, a static catalog with no cache-through.**
Seed a fixed set of movies once and only ever recommend from that set. Predictable, no per-request TMDB calls, dead simple. Con: it cannot match arbitrary imported movies. A user's Letterboxd export will contain films outside any fixed seed (older, foreign, indie, brand new), and those rows would all report unmatched, gutting the import feature that is core to the product. A static catalog also goes stale with no path to grow.

## Decision

**Chosen option**: Option 1. Hybrid population (re-runnable seed plus cache-through), constrained generation (retrieve real candidates, AI ranks only those), and a validation backstop that every returned id exists, all writing through a server-side service path.

The RECOMMEND picks, each with a one-line why:
- **TMDB client: direct fetch calls, no SDK.** TMDB's REST API is small and stable and Next.js has `fetch` built in, so a thin typed wrapper is fewer dependencies and less to break. Runner-up: a third-party TMDB SDK (saves a little typing, adds a dependency we would have to track).
- **TMDB auth: the v4 bearer read-access token, in `TMDB_READ_TOKEN`.** The bearer token goes in an `Authorization` header so it never lands in a URL, query string, or log. Runner-up: the v3 `api_key` query param (works, but leaks the key into request URLs and logs).
- **Rate limiting: a lightweight in-process token-bucket limiter that also honors Retry-After and backs off on 429.** One small module gates every TMDB call under the limit and retries politely, no extra dependency. Runner-up: a bounded-concurrency queue (simpler, but concurrency alone does not cap request rate as precisely as a token bucket).
- **Service file layout: `src/lib/tmdb` for the client and limiter, `src/lib/catalog` for the resolver, validation, and candidates.** Matches the AGENTS.md Next.js-default structure (shared code in `src/lib`), with a clean seam between "talk to TMDB" and "our catalog logic." Runner-up: one flat `src/lib/movies` folder (fewer files, but blurs the external-vs-internal boundary).
- **Seed execution: a TypeScript script run with `tsx` via an npm script, `npm run seed:movies`.** One command, no build step, reuses the same client and resolver, and idempotent upserts make it safe to re-run. Runner-up: a one-off route handler (convenient, but mixes an operational job into the request surface).
- **Title+year match rule: normalize the title (lowercase, trim, strip punctuation and leading articles like "the"/"a"), then prefer an exact year match, then within plus or minus one year ranked by popularity; below a stated confidence bar, treat as unmatched.** A concrete, boring rule that resolves the common cases and fails closed on the doubtful ones. Runner-up: fuzzy string distance scoring (more powerful, more knobs and false confidence than an MVP needs).
- **Candidate retrieval (MVP): a database-filter placeholder.** Filter real `movies` rows by genres, keywords, and text, ordered by popularity, and hand that shortlist to the AI. It returns only real rows today; feature 7 and 10 swap in vector retrieval later. Runner-up: nothing until vectors exist (would block vibe search from shipping at all).
- **First-insert behavior: full-fetch and upsert a complete record on first reference, with synced_at set.** One TMDB details call gives us everything we cache, so a stub-then-enrich two-step is needless complexity; stubs stay rare and mean "not yet fully cached." Runner-up: insert a stub then enrich in the background (adds a job and a partial-record state for no MVP benefit).
- **Service client and env vars: install `@supabase/supabase-js`, use a server-only client with `SUPABASE_SECRET_KEY` for movie upserts.** `movies` is a shared system-owned table, not user data, so the secret key is the correct and legitimate system path here. A user-scoped client is never used for movie writes. Env vars: `SUPABASE_SECRET_KEY` (server-side movie writes) and `TMDB_READ_TOKEN` (the TMDB v4 bearer token), both validated at startup.

## Rationale

Hybrid population is the only option that serves both entry paths. The seed gives us an instant, sensible catalog of well-known movies so the feed and onboarding have something real to work with on day 1. Cache-through covers the long tail: when a user imports a film the seed never included, we fetch it once, cache it, and it is permanent. Option 3's static catalog fails the import feature outright, and a fetch-everything-up-front approach is impossible against TMDB's rate limits and pointless for movies no user will ever reference.

Constrained generation beats validate-after because it makes "no fake titles" a property of the pipeline, not a cleanup step. If the AI can only choose from a shortlist of real rows we handed it, it cannot name a movie that does not exist, full stop. The post-check that every returned id is in `movies` is a cheap backstop that catches any prompt-format slip. Option 2 spends TMDB calls and Claude tokens recovering from hallucinations we can simply prevent, and it still risks a near-miss reaching the user. The one honest caveat is candidate quality (see the premise note): in the MVP the shortlist comes from database filters, not taste vectors, so early picks are real but less finely matched. That is the right trade for shipping, and feature 7's vectors upgrade it in place.

Cache-through must fail closed. When TMDB has no answer for a reference, the resolver returns a clear no-match. It never invents a placeholder movie to keep a flow moving. This is what lets the import feature record an honest unmatched row (into imports.unmatched, per ADR 0002) instead of poisoning the catalog with a guess. Failing closed is the whole point of the guarantee.

The rate-limit reality drives several picks. A seed of several thousand movies, each needing a details call plus credits and keywords, is thousands of requests, which at TMDB's free-tier ceiling takes minutes and will hit 429s if we fire blindly. So the client has to gate every call through one token-bucket limiter and back off on Retry-After. This is not optional polish; it is what makes the seed and any large import actually complete. Direct fetch keeps that client small; the v4 bearer token keeps the key out of URLs and logs; `tsx` runs the seed with no build step.

On the service client: AGENTS.md is strict that the secret key must never touch a user data path, because it bypasses RLS. `movies` is the deliberate exception, and it is worth being loud about so no one copies the pattern onto user data. `movies` is a shared, system-owned table (read-all for authenticated users, writes service-only, from ADR 0002). It is not one user's data, so there is no per-user row ownership for RLS to enforce on writes. The system, not a user, owns catalog writes, so the server-side service client with `SUPABASE_SECRET_KEY` is exactly right here, and only here.

## Feature design

**Data model sketch (the `movies` table after this feature).**
This is an ALTER TABLE on the existing table from ADR 0002, not a new table. The existing columns stay as they are:
`id` bigint PK (the TMDB id), `title`, `release_year`, `overview`, `poster_path`, `genres` jsonb, `runtime_minutes`, `created_at`, `updated_at`.

Added by this feature (8 columns):
- `imdb_id` text, nullable, UNIQUE (the external key for IMDb-export resolution).
- `directors` jsonb, array of `{id, name}`.
- `top_cast` jsonb, array of `{id, name, character}`.
- `keywords` jsonb, TMDB keyword tags.
- `vote_average` numeric(3,1).
- `vote_count` integer.
- `popularity` numeric.
- `synced_at` timestamptz, nullable (null means not yet fully cached; set means fully cached).

Indexes added: a UNIQUE index on `imdb_id`, and an index on `popularity` (candidate ordering and lists read by popularity). No semantic or vibe columns are added here; that is feature 7's boundary.

**State transitions (a movie's cache state).**
`referenced` (some path names a movie id or ref) → `stub` (a row exists but `synced_at` is null, metadata incomplete) → `cached` (`synced_at` is set, full metadata present). In the MVP we full-fetch and upsert a complete record on first reference, so a movie goes straight from referenced to cached in one step and stubs are rare (they would only appear if a partial write ever landed). The resolver treats any row with `synced_at` null as "needs fetch," so a stub is self-healing on next resolve.

**API surface (server-side service functions, not public HTTP endpoints).**
These are internal module functions consumed by features 7 (import/taste) and 10 (vibe search). They are not REST endpoints.

| Function | Module | Inputs | Output | Called by | Failure return |
| --- | --- | --- | --- | --- | --- |
| `getDetails` | src/lib/tmdb | tmdbId | full TMDB movie detail (with credits, keywords) | resolver, seed | throws on non-2xx after backoff; null on 404 |
| `searchByTitleYear` | src/lib/tmdb | title, optional year | ranked TMDB search results | resolver | empty list on no results |
| `findByImdbId` | src/lib/tmdb | imdbId | the matched TMDB movie or none | resolver | null when TMDB find returns nothing |
| `listPopular` / `listTopRated` / `listTrending` | src/lib/tmdb | page | a page of TMDB movie summaries | seed | throws on non-2xx after backoff |
| `resolveByTmdbId` | src/lib/catalog | tmdbId | a real cached `movie` | import, seed, feed | `{ status: 'no-match' }` (never a fake movie) |
| `resolveByImdbId` | src/lib/catalog | imdbId | a real cached `movie` | import | `{ status: 'no-match' }` |
| `resolveByTitleYear` | src/lib/catalog | title, year | a real cached `movie` | import | `{ status: 'no-match' }` when below the confidence bar |
| `validateMovieIds` | src/lib/catalog | ids[] | which ids exist / which are missing | vibe search (backstop) | missing ids listed; empty input → empty result |
| `getCandidates` | src/lib/catalog | filter (genres, keywords, text, limit) | real catalog movies for constrained generation | vibe search, feed | empty list when nothing matches (never fabricated) |
| `resolveMany` | src/lib/catalog | refs[] (each a tmdbId, imdbId, or title+year) | per-ref result: `{ ref, movie }` or `{ ref, status: 'no-match' }` | import (in chunks) | each ref resolves or reports no-match independently; one shared rate budget for the whole call |
| `seedMovies` | seed script | (none; reads TMDB lists) | count upserted | `npm run seed:movies` | logs and continues per-movie; exits non-zero on fatal config error |

`resolveMany` is the primitive the import feature (feature 7) calls. It takes a chunk of references, resolves them through one shared rate budget with bounded concurrency, and returns a result per reference (cached-and-fetched already-cached rows are free; only cold ones hit TMDB). The import feature owns chunking a whole CSV across invocations and recording progress (imports.status, imports.unmatched, per ADR 0002); this feature owns resolving one chunk correctly. A single serverless invocation must not try to resolve an entire large import at once, or it risks the function time limit (per ADR 0001's synchronous-import threshold).

The resolver functions return a discriminated result: a real `movie` on success or `{ status: 'no-match' }` on failure. They never return a fabricated movie. On a cold movie, a resolve calls `getDetails`, upserts via the service client with `synced_at` set, and returns the cached row.

**Key invariants.**
- Every movie surfaced anywhere in the app exists as a row in `movies`.
- The resolver never returns a fabricated movie; it fails closed to `no-match`.
- Movie writes happen only through the server-side service client (`SUPABASE_SECRET_KEY`).
- `imdb_id` is unique across the table.
- `synced_at` set means the row is fully cached; null means it still needs a fetch.

**Security model.**
`movies` is a shared, system-owned table. Reads are RLS read-all for authenticated users. Writes go only through a server-side service client using `SUPABASE_SECRET_KEY`. This is the legitimate system-path exception to the never-use-the-secret-key rule, and it is distinct from that rule precisely because `movies` is not user data (there is no per-user ownership to enforce). No user-scoped path ever writes movies. The TMDB token (`TMDB_READ_TOKEN`) is server-only and never shipped to the browser. All TMDB calls, all resolution, and all validation run server-side. Env vars are validated at startup so a missing key fails loudly.

**Configuration required.**
- `SUPABASE_SECRET_KEY` — server-side movie writes (the system path).
- `TMDB_READ_TOKEN` — the TMDB v4 bearer read-access token, sent as an Authorization header.
Both are validated at startup (per the AGENTS.md rule). This feature installs `@supabase/supabase-js` (not yet installed), just in time.

**Critical test scenarios** (each maps to an AC):
- Resolve a known TMDB id for a movie not yet cached: it fetches, upserts with `synced_at` set, and returns the real row (AC-3).
- Resolve an IMDb id from an IMDb export: exact match via find-by-external-id, returns the real movie (AC-4).
- Resolve a made-up or unresolvable reference: returns `no-match`, and nothing is written to `movies` (AC-3, AC-4).
- `validateMovieIds` over a set where one id is not in the catalog: that id is flagged as missing (AC-5).
- Run the seed twice: idempotent, no duplicate rows, existing rows re-upserted not re-inserted (AC-6).
- A browser request cannot write movies (RLS read-only) and cannot see `TMDB_READ_TOKEN` or `SUPABASE_SECRET_KEY` (AC-7).

## Build plan
Tracer Bullet: the catalog is the infrastructure slice the user-facing features stand on, so this is built as one coherent thread (schema, external client, resolver, validation, seed), each part applied and verified, migration first.

1. Migration: ALTER `movies` to add the 8 columns (`imdb_id` unique, `directors`, `top_cast`, `keywords`, `vote_average`, `vote_count`, `popularity`, `synced_at`), plus the unique `imdb_id` index and the `popularity` index. Apply and confirm live. — AC-1
2. Install `@supabase/supabase-js`. Add the server-side service client (using `SUPABASE_SECRET_KEY`) and the TMDB client in `src/lib/tmdb` (`getDetails`, `searchByTitleYear`, `findByImdbId`, `listPopular`/`listTopRated`/`listTrending`) with the token-bucket rate limiter and 429/Retry-After backoff. Validate `SUPABASE_SECRET_KEY` and `TMDB_READ_TOKEN` at startup. — AC-2, AC-7
3. Cache-through resolver in `src/lib/catalog` (`resolveByTmdbId`, `resolveByImdbId`, `resolveByTitleYear`) with full-fetch-on-first-reference, upsert ON THE ID (so concurrent resolves of the same cold movie update rather than duplicate), `synced_at` set, and fail-closed `no-match`. Implement the normalized title+year match rule (lowercase, trim, strip punctuation and leading articles; exact year, then plus or minus one year by popularity; below the bar is unmatched). — AC-3, AC-4
4. Batch resolver `resolveMany(refs[])` in `src/lib/catalog`: resolve a chunk of references through one shared rate budget with bounded concurrency, returning a per-reference matched/no-match result, so the import feature can process a CSV in bounded chunks. — AC-9
5. Validation service in `src/lib/catalog`: `validateMovieIds` (the backstop that every id exists) and `getCandidates` (MVP database-filter retrieval of real movies; note the vector upgrade lands with feature 7/10). — AC-5
6. Re-runnable, idempotent seed script (`npm run seed:movies` via `tsx`) that pulls popular + top-rated + trending and upserts full metadata. — AC-6
7. Document the TMDB attribution UI obligation (notice, logo, link back) for the downstream features that render movies. — AC-8

## Consequences

**Positive.**
- Every title the app shows is real, enforced by the pipeline (constrained generation) and re-checked by a backstop, not by hope.
- The catalog serves both entry paths: a sensible seed on day 1, and permanent coverage of any imported movie via cache-through.
- Other features read cached metadata from one table with no per-request TMDB calls.
- Writes are locked to one system path; the browser cannot write movies or see either secret.
- `synced_at` is in place, so a lazy refresh can be added later with no schema change.

**Negative.**
- Cache-through adds one TMDB round trip and its latency the first time a movie is seen, so the resolver belongs on import/seed paths, not blocking a hot render.
- MVP candidate quality is basic (database filters, not taste vectors) until feature 7's embeddings land; picks are real but less finely matched early.
- TMDB free-tier rate limits bound how fast the seed and large imports can run; a full seed takes minutes, not seconds.
- The rate limiter is in-process. It fully protects the seed (one script, one process) and calls within a single serverless invocation, but it does NOT coordinate across concurrent invocations (Vercel runs them in separate isolates with separate module state). So several parallel imports could each believe they hold the full TMDB budget and collectively exceed it. The 429 backoff absorbs this without data loss, but it is a real ceiling; a shared limiter (see Follow-up) is the correct fix once concurrency grows. Keeping resolution to bounded chunks (via `resolveMany`) and processing one import at a time per user keeps the MVP within bounds in practice.
- Two concurrent resolves of the same cold movie could both fetch it from TMDB and both upsert it. Because the upsert is keyed on the primary key (the TMDB id), the second write updates rather than duplicates, so the race is safe (one wasted TMDB call, never a duplicate row). Resolvers must upsert on the id, not insert.
- A seed drawn from popular/top-rated/trending skews the starting catalog toward mainstream films; the long tail fills in only as users reference it.
- Caching with no active refresh means metadata (ratings, popularity, cast corrections) can drift from TMDB over time until a refresh path is added.

**Neutral.**
- `movies` is deliberately a shared system table with a service-key write path, an exception to the user-data rule that must not be copied onto user data.
- The taste vectors, embeddings, and semantic understanding stay out of this feature entirely; this schema is factual metadata only.

## Follow-up
- [ ] Lazy TTL refresh of cached movies (deferred; `synced_at` is in place for it).
- [ ] Vector-based candidate retrieval replaces the MVP database-filter placeholder (feature 7/10).
- [ ] Shared/distributed rate limiter (e.g. Upstash Redis) if concurrent imports grow, so the TMDB rate limit is enforced globally across serverless invocations, not just per-invocation. Until then, bounded chunks + one-import-at-a-time-per-user + 429 backoff keep it in bounds.
- [ ] TMDB attribution UI built where movies render (design system / detail page).
- [ ] (optional) A Supabase conventions skill is not installed; adding one would help keep the service-client and RLS patterns consistent.
