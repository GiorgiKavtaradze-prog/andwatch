# Hardening, csv-import-taste-profile, 2026-07-05

**Analysed by**: systems-level review on opus
**Scope**: 10 files, feature branch (not a git repo; scoped to ADR 0006 feature)
**Risk posture**: Harden before merge

## Summary
The RLS split, the getUser() gates, upsert/embed idempotency, and the chunkIndex-0 reset are all done correctly, and the taste vector is derived from the ratings table (not the drifting counts), so most partial-failure paths self-heal on re-drive. The exposure is at the chunk boundary: the whole chunk is one atomic ratings upsert with no server-side validation, so a single poison row (two source rows resolving to the same catalog movie_id, a NaN rating, or a malformed rated_at) fails the entire chunk deterministically and, because re-drive reproduces the same input, blocks that import permanently. Secondary risks are cost and duration under load: no bound on client-sent chunk size, a quadratic rewrite of the unmatched jsonb, and no OpenAI timeout. No cross-user outage, data-loss, or secret-leak must-fix was found.

## Should-harden

### ✅ FIXED, data-integrity: duplicate movie in one chunk fails the whole upsert unrecoverably, `src/app/import/actions.ts:155`
_Resolved 2026-07-05: matched rows are now keyed by `movie_id` in a Map before the upsert (latest wins), so duplicates within a chunk collapse to one rating and the upsert can no longer touch a row twice. Regression tests in `src/app/import/actions.test.ts` (duplicate collapses to one, latest value retained; distinct movies kept)._
**Scenario**: A user's export contains two rows that resolve to the same catalog movie in one 100-row chunk. This is realistic two ways: the fuzzy title+year path (`resolveByTitleYear`) maps two near-identical Letterboxd entries to the same TMDB id, or an IMDb export lists the same `Const` twice. `ratingsToUpsert` then holds two objects with the same `(user_id, movie_id)`. supabase-js sends `.upsert(array, { onConflict: "user_id,movie_id" })` as a single `INSERT ... ON CONFLICT DO UPDATE`, and Postgres raises "ON CONFLICT DO UPDATE command cannot affect row a second time" for the whole statement.
**Impact**: The chunk throws, all 3 retries reproduce the identical error (the input is deterministic), the import is marked `failed`, and the user's "Resume" re-drives the same rows and fails again. The import is permanently unfinishable with no workaround. Blast radius is one user per bad file, but total for them.
**Mitigation**: Dedupe `ratingsToUpsert` by `movie_id` before the upsert (keep the last occurrence so latest-wins matches the re-import merge rule). Do the same fold for `matchedMovieIds`. A pure `dedupeByMovieId(rows)` helper is trivial to unit test.
**Verify with**: Vitest unit test on the dedupe helper (input with two rows sharing a movie_id yields one, last value retained). Runtime end-to-end proof needs `/verify` with a crafted file.

### 🟠 adversarial: server trusts client rows with no bound or field validation, `src/app/import/actions.ts:95`
**Scenario**: `processImportChunk` accepts `rows: ParsedRow[]` straight from the browser with no length cap and no per-field checks. Two concrete triggers. (a) A signed-in user (the surface is login-walled, so this is an authenticated abuser or a buggy client) POSTs one chunk of 50k rows; `resolveMany` then runs 50k references at concurrency 5 through TMDB inside a single server action, blowing the Vercel 300s duration and hammering the shared in-process TMDB budget (429 storm, ADR 0003 ceiling). (b) A crafted `rawValue` of `NaN` (or a non-number that arithmetic coerces to `NaN`) flows through `normalizeRating` to a `NaN` `normalized_value`, which the `integer not null` column rejects, failing the whole chunk; likewise a garbage `ratedAt` string hitting the `timestamptz` column ("invalid input syntax for type timestamp") fails the whole chunk. The client-side `parseRatingsCsv` guards these, but the server action is independently callable and must not trust that.
**Impact**: Duration/cost exhaustion and TMDB-budget starvation for other concurrent imports (a); a single malformed field poisons and permanently blocks an import the same way as the duplicate case (b).
**Mitigation**: At the top of `processImportChunk`, reject `rows.length > CHUNK_SIZE`. Coerce each `rawValue` with a finite-number guard (drop or route to unmatched if not finite). Normalize `ratedAt` server-side to an ISO string or `null` (parse and discard unparseable dates rather than passing the raw string to Postgres).
**Verify with**: Vitest unit tests on a `validateChunk`/`coerceRow` pure function (over-length rejected; NaN rawValue rejected or nulled; unparseable date coerced to null; valid rows pass unchanged).

### 🟠 scale: imports.unmatched jsonb is re-read and rewritten in full every chunk (quadratic), `src/app/import/actions.ts:171`
**Scenario**: A first-time user whose library is mostly outside the seed imports 5,000 rows (50 chunks) with most rows unmatched. Each chunk reads `imp.unmatched` (the entire growing array), then writes `[...baseList, ...newUnmatched]` back. The array grows by ~100 objects per chunk, so total bytes read+written across the import is O(N^2) in the unmatched count, and the final row holds a multi-thousand-element jsonb blob that `getImportStatus` then ships whole to the client.
**Impact**: Chunk latency climbs as the import progresses, the imports row bloats, and the review-panel payload grows unbounded. Slow imports and heavy writes under exactly the cold-library case the feature is meant to serve.
**Mitigation**: Append unmatched rows to a child table (one insert per chunk, no re-read), or keep the jsonb but store only a capped head (e.g. first 200) plus a total count for the panel. Either removes the re-read-and-rewrite.
**Verify with**: `/verify` at runtime by importing a large mostly-unmatched fixture and observing flat per-chunk write size; the capping helper (head + count) is unit-testable in Vitest.

### 🟠 resource: no OpenAI (or Supabase) call timeout, so a hung dependency rides out the function budget, `src/lib/embeddings/index.ts:24`
**Scenario**: `new OpenAI({ apiKey })` uses the SDK defaults (roughly a 10-minute request timeout with its own internal retries). If an embeddings request hangs, `embedTexts` inside `withRetry` can consume far more than the Vercel 300s duration before the platform kills the function, and the chunk fails after burning the whole budget with nothing written.
**Impact**: A single slow OpenAI call turns one chunk into a maxed-out, then-killed serverless invocation; the import fails late and expensively, and the built-in SDK retries compound with `withRetry`.
**Mitigation**: Construct the client with an explicit low `timeout` and `maxRetries: 0` (let the feature's `withRetry` own retry), so a hung call fails fast into the backoff. Consider the same bounded timeout posture on the service-client movie writes.
**Verify with**: Vitest can assert the client is constructed with the timeout/maxRetries options (inject or inspect config); true hang behavior only proves out under `/verify` or a fault-injection harness.

## Watch / accept
- 🟡 `src/lib/embeddings/index.ts:142`, two concurrent imports (or an import racing the seed) both `select ... .is("embedding", null)` for the same cold movie and both embed it. This is check-then-act, so it double-spends one OpenAI call and writes the same vector twice (last wins). No corruption, small cost; acceptable to monitor until concurrency grows.
- 🟡 `src/app/import/actions.ts:169`, a double-fired `runImport` (two tabs, or a stray double click on Resume) interleaves the read-modify-write of `matched_rows`/`unmatched_rows` and can lose a count. Counts are cosmetic: `computeTasteProfile` reads the ratings table directly, and re-drive from chunk 0 recomputes them. Monitor, do not block.
- 🟡 `src/app/import/actions.ts:190`, `error.message` from Supabase/OpenAI is returned to the client. It can surface schema, constraint names, or the offending value (not secrets or keys). Low severity; consider mapping to a generic message before public exposure.
- 🟡 `src/app/import/actions.ts:228`, if the final `update status='completed'` write fails after `computeTasteProfile` already wrote the vector, the import is stuck at `processing` while the data is actually complete. Purely a status-display artifact; the user already got their result.
- 🟡 `src/app/import/actions.ts:155`, the ratings upsert and the imports count update are separate writes with no transaction, so a crash between them drifts the counts from reality. Self-healing because the taste vector and the finalize decision both read ratings, not counts.

## Already covered
- RLS is real: `imports`, `ratings`, and `taste_profiles` all go through the user-scoped `createClient()`; only movie and embedding writes use `getServiceClient()`. Every action gates on `getUser()`, not `getSession()`.
- Ratings upsert is idempotent on `(user_id, movie_id)`, embedding is idempotent via `.is("embedding", null)`, and `chunkIndex === 0` resets the running counts so a clean re-drive recomputes rather than double-counts.
- `normalizeRating` clamps to 0..100, so the scale math itself can never violate the `normalized_value between 0 and 100` CHECK (the residual `NaN` path is covered above under validation).
- `resolveMany` returns an order-preserving array aligned to `refs`, and `refs` is built in `input.rows` order, so `results.forEach(({result}, i) => input.rows[i])` maps each result to the correct source row.
- `scripts/backfill-embeddings.ts` advances `offset` by the skipped count only: embedded rows leave the `is null` set and the still-null skipped rows (smallest ids) sort to the front, so `offset += skipped` steps past exactly them. It terminates and does not skip embeddable rows.
- The taste vector is written only in `finalizeImport` after all chunks complete, and only at or above the floor, so a half-built profile is never produced.
