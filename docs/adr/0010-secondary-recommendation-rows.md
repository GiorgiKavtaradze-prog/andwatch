# 0010. Secondary recommendation rows for Reel

**Date**: 2026-07-05
**Status**: In Progress

## Summary

This decides how the signed-in home shows extra themed recommendation rows beyond the main feed ("hidden gems for your taste", "crowd-pleasers for you", "more of your top genre"). Each row is a distinct deterministic slice of the same taste vector: we reuse the feed's cosine retrieval to pull one larger candidate pool of real, unseen movies ranked by similarity, then slice that pool by a secondary signal per row (low popularity, high popularity, top genre) and dedupe across rows. Reasons are short grounded lines built from each movie's own metadata, not a Claude call, so the home stays fast and free to load. There is no new table, no new AI cost, and no new migration: it reuses the feed's `match_feed_candidates` function, the taste vector, `groundedReason`, and the `recommendation-card`.

## Context

Feature 8 (ADR 0007) built the main feed: the top ~10 unseen movies by cosine similarity to the taste vector, with a popularity tiebreak, each given a Claude-written reason cached in `recommendations`. Feature 13 adds more recommendation surfaces on the home so a returning user sees several angles on their taste, not just one ranked list. The Done-when is at least two themed rows of real, personalized picks with reasons, **distinct from the main feed**.

The engine already has everything these rows need. The taste vector and the HNSW cosine index (ADR 0006) rank the catalog by taste; `match_feed_candidates` (ADR 0007) already returns the nearest unseen real movies with their popularity in the payload. So a single call to that function with a larger pool gives a ranked set of real, unseen, taste-relevant candidates, and different rows are just different **secondary sorts or filters** over that one pool. That keeps every row real by construction (SQL over real rows), personalized (cosine-ranked), and distinct from the feed (the feed shows the popularity-tiebroken top slice; these rows deliberately surface the parts the feed's tiebreak pushes down, like low-popularity near-matches).

The cost question is the load-bearing one. The main feed pays a Claude call per regeneration and caches it precisely because reasons are expensive. Multiplying Claude reasons across several rows on **every home load** would be slow and costly. So secondary rows use deterministic grounded reasons (reusing `groundedReason` from ADR 0007) built from the movie's own genre and director. The main feed stays the premium Claude-reasoned surface; the secondary rows are the fast, free, browse-more surface.

> ⚠️ Premise note: three real forces to name before building, none of them blockers.
>
> 1. **Rows must be distinct from the feed, or they are noise.** The Done-when says "distinct from the main feed." Reusing the same top-10 the feed shows would just duplicate it. So the rows deliberately slice the pool by signals the feed does *not* lead with: low popularity ("hidden gems"), high popularity among near-matches ("crowd-pleasers"), and a single favored genre. And we dedupe across rows so the same movie does not appear twice on the page.
> 2. **Grounded reasons, not Claude, on the home path.** A personal Claude reason per pick per row per load is the expensive thing the feed cache exists to avoid. Secondary rows use a deterministic grounded line ("a quieter pick that fits your taste", "a crowd favorite in your wheelhouse") from the movie's real metadata. It is honest and personalized (the *picks* are taste-ranked), just not individually AI-written. Upgrading a specific row to cached Claude reasons is a Follow-up, not day-one.
> 3. **Rows need a taste vector.** Like the feed, these rows rank by the taste vector, so a user with no profile sees the onboarding/import prompt instead of empty rows. A thin catalog yields short rows (fewer picks), shown honestly, never padded.

## Requirements

**User stories**

- As a signed-in user with a taste profile, I want a few themed rows on my home beyond the main feed, so I can explore my taste from more than one angle.
- As a user, I want those rows to be real, unseen movies picked for me, each with a reason, so they feel personal and trustworthy.
- As a user, I want the home to load fast, so browsing more does not cost a wait.
- As a user with no profile, I want a clear path to build one rather than empty rows.

**Acceptance criteria**

- **AC-1**: The signed-in home shows at least two themed recommendation rows for a user with a taste profile, each a distinct algorithmic slice, not a repeat of the main feed's ranking.
- **AC-2**: Rows are built deterministically from the taste vector by reusing the feed's cosine retrieval (one call to `match_feed_candidates` over a larger pool), sliced per row by a secondary signal: "Hidden gems" (high similarity, low popularity), "Crowd-pleasers for you" (high similarity, high popularity), and "More <top genre>" (near-matches in the user's top-affinity genre).
- **AC-3**: Every pick is a real, unseen (not-yet-rated) catalog movie, personalized by cosine similarity to the taste vector; a movie appears in at most one row (deduped across rows).
- **AC-4**: Each pick carries a short grounded reason built from the movie's own metadata (no per-load Claude call); the main feed remains the Claude-reasoned surface.
- **AC-5**: A user with no taste vector sees the onboarding/import prompt instead of rows; loading and short/empty-row states render honestly (no padding).
- **AC-6**: All retrieval runs server-side under the user-scoped RLS client (the feed RPC is `security invoker`); no new secrets; each pick links to its detail page and offers add-to-watchlist.
- **AC-7**: Built to `design.md`, reusing `recommendation-card`; rows render as horizontally scrollable strips, visually distinct from the feed grid.

## Options considered

### Option 1 (chosen): one cosine pool, sliced per row, grounded reasons, no new table

Call `match_feed_candidates` once for a large pool of nearest unseen real movies, derive each row by a secondary sort/filter (low popularity, high popularity, top genre), dedupe across rows, and label each pick with a grounded reason.

- Pro: reuses the feed's RPC, the taste vector, `groundedReason`, and the `recommendation-card`; one vector query powers all rows; no migration, no new AI cost, fast home load.
- Pro: rows are real by construction and genuinely distinct from the feed (they surface what the feed's popularity tiebreak de-emphasizes).
- Con: the reasons are templated, not individually Claude-written, so less rich than the feed's; a per-row cosine over the *whole* catalog (rather than one shared pool) could surface a slightly wider set for a genre row.

### Option 2: a Claude-reasoned, cached row set (like the feed, per row)

Generate each row's picks and Claude reasons, cache them in a new `recommendation_rows` table, regenerate on profile change.

- Pro: rich per-pick reasons on every row, matching the feed's quality.
- Con: a new table, a new cache lifecycle, and a Claude cost per row per regeneration, for secondary surfaces that are meant to be the cheap "browse more" path. Heavy for the value; the feed already carries the premium reasoned experience.

### Option 3: separate purpose-built vector queries per row

Write a new RPC per row shape (a low-popularity-weighted search, a genre-filtered search, and so on).

- Pro: each row can be tuned independently at the SQL level.
- Con: several new database functions and migrations for what one shared pool plus in-app slicing already delivers; more surface to apply and maintain for a marginal ranking gain.

## Decision

**Chosen option**: Option 1. One call to `match_feed_candidates` returns a large pool of nearest unseen real movies; the app slices it into themed rows by secondary signals, dedupes across rows, and labels each pick with a grounded reason. No new table, no new migration, no new AI cost.

The RECOMMEND picks, each with a one-line why and its runner-up:

1. **Reuse `match_feed_candidates` with a large pool, slice in app code.** One RPC call (pool ~60) gives a ranked set of real, unseen, taste-relevant candidates with popularity in the payload; the rows are secondary sorts/filters over that one pool. Runner-up: a per-row RPC (Option 3) — more migrations for a marginal gain.
2. **Three row definitions, at least two of which always render.** "Hidden gems" = the near pool sorted by *ascending* popularity (high taste fit, under-the-radar). "Crowd-pleasers for you" = the near pool sorted by *descending* popularity (high taste fit, widely liked). "More <top genre>" = the near pool filtered to the user's highest-affinity genre (from `genre_affinities`), shown only when it has enough picks. The first two always work from the pool; the third is a bonus when the genre is well represented. Runner-up: fixed two rows only (simpler, but the genre row adds a strong personal angle when available).
3. **Dedupe across rows, greedily in row order.** A movie assigned to an earlier row is removed from the candidate set for later rows, so the same title never appears twice on the home. Runner-up: allow repeats (simpler, but a movie showing in two rows looks like a bug).
4. **Grounded reasons via `groundedReason`, with a per-row lead-in.** Each pick's reason is `groundedReason(movie)` (ADR 0007) optionally prefixed by a short row-appropriate lead ("a quieter pick", "a crowd favorite") so rows read a little differently. No Claude call. Runner-up: cached Claude reasons per row (Option 2's cost, deferred to Follow-up).
5. **Render deterministically on the signed-in home, no cache.** The rows are cheap SQL, so the home server-renders them on each load (one vector query plus in-app slicing); there is nothing expensive to cache. Runner-up: cache the rows (needless, since there is no Claude call and the query is one indexed lookup).
6. **No profile → the onboarding/import prompt; short rows shown honestly.** Rows need the taste vector; without it the home shows the path to build one. A thin pool yields short rows, never padded. Runner-up: none, this mirrors the feed's honest states.

## Rationale

The load-bearing decision is to treat secondary rows as **cheap deterministic slices of the engine, not a second premium surface**. The taste vector and the feed's cosine RPC already produce a ranked set of real, unseen, personal candidates; different rows are just different views of that one pool, so the whole feature is one vector query plus in-app sorting. That is why Option 2 is rejected: a per-row Claude-reasoned cache is the feed's cost model applied to a surface whose whole point is fast, free browsing, and the feed already carries the premium reasoned experience. And Option 3 is rejected because one shared pool plus in-app slicing delivers the distinct rows without a migration per row shape.

Distinctness from the feed falls straight out of the slicing: the feed leads with the popularity-tiebroken top of the near set, so "hidden gems" (the low-popularity near-matches the feed de-emphasizes) and a single-genre row are genuinely different picks, and cross-row dedupe keeps the page clean. Grounded reasons keep the promise ("personalized picks with reasons") honestly: the picks are taste-ranked and real, and the reason names the movie's own genre and director, which is truthful and personal enough for a browse surface, with a clear upgrade path to cached Claude reasons if a row proves worth it.

Everything is reuse: the feed RPC, the taste vector, `genre_affinities`, `groundedReason`, the `recommendation-card`, the detail-page link, and the watchlist control. The only new code is a small `src/lib/rows` module and the home rendering.

## Feature design

### Data model

**No new table, no new migration.** Reuses `taste_profiles.vector` / `.genre_affinities`, the `movies` catalog + embedding, `ratings` (for the unseen anti-join, inside the reused RPC), and `match_feed_candidates` (ADR 0007). Depends on the feature-8 migration being applied (the RPC must exist).

### Row construction

```
read taste vector + genre_affinities (user-scoped)
        │
        ▼
match_feed_candidates(taste_vector, pool_size = 60)   ── one vector query, real unseen rows
        │  pool: [{ movie, score(=cosine sim), popularity }]
        ▼
slice into rows (greedy dedupe in this order):
  1. Hidden gems        = pool sorted by popularity ASC  → take N        (high fit, low popularity)
  2. Crowd-pleasers     = remaining sorted by popularity DESC → take N    (high fit, high popularity)
  3. More <top genre>   = remaining filtered to top genre_affinities genre → take N (if ≥ MIN_ROW)
        │
        ▼
label each pick with groundedReason(movie) + a per-row lead-in
        ▼
render rows of recommendation-card (href → /movie/[id], watchlist toggle)
```

`N` is the row length (about 12); `MIN_ROW` is the minimum picks for an optional row to show (about 4). Pool, `N`, and `MIN_ROW` are stated, tunable defaults.

### API surface

Internal server functions and a server-rendered home; no public REST. User data through the user-scoped RLS client, gated by `getUser()`.

| Function | Module | Key inputs | Key outputs | Auth path | Key errors |
| --- | --- | --- | --- | --- | --- |
| `getHomeRows` | server (home) | (user from session) | `{ status: 'no-profile' }` \| `{ status: 'ready'; rows: Row[] }` | user-scoped (RLS); reuses the feed RPC | not signed in → redirect |
| `buildRows` | `src/lib/rows` | pool candidates, `genre_affinities` | `Row[]` (title, picks with grounded reason), deduped | pure (no I/O) | none (short rows when thin) |

A `Row` is `{ key, title, picks: { movie, reason, inWatchlist }[] }`. `getHomeRows` reads the taste vector, calls the feed RPC for the pool, builds the rows, and marks watchlist state.

### Key invariants

- **Only real, unseen movies appear.** The pool is `match_feed_candidates` (SQL over real rows, rated excluded); rows are subsets of it.
- **No movie appears in two rows.** Greedy dedupe in row order.
- **Rows need a taste vector.** No vector → the no-profile prompt, never empty rows.
- **No Claude on the home path.** Reasons are `groundedReason`; the home load is one indexed vector query plus in-app sorting.
- **User-scoped throughout.** The taste read and the RPC run under RLS; no service key on this path.

### Security model

Reuses the feed's model: the taste read runs under the user-scoped client; `match_feed_candidates` is `security invoker` so RLS scopes its ratings anti-join to the caller; the watchlist read/write is owner-scoped. No new secrets, no new vendor. Per-user data isolation, not a regulated scope.

### Configuration required

- None new. No Anthropic, no OpenAI on this path (no embedding and no reason-writing call; the pool is pre-embedded catalog rows and reasons are templated).

### Critical test scenarios

- **Two-plus distinct rows (AC-1, AC-2)**: a profiled user's home shows Hidden gems and Crowd-pleasers (and More <genre> when the genre is well represented), each a different slice of the pool, none equal to the feed's top-10.
- **Real, unseen, deduped (AC-3)**: every pick is a real catalog row the user has not rated; no movie appears in two rows.
- **Grounded reason, no Claude (AC-4)**: each pick has a metadata-grounded reason; no Anthropic request fires on a home load.
- **No profile (AC-5)**: a user with no taste vector sees the onboarding/import prompt, not rows.
- **Thin pool (AC-5)**: a small near pool yields short rows (and drops the optional genre row below `MIN_ROW`), never padded.
- **Auth (AC-6)**: signed-out users are redirected; retrieval is user-scoped; picks link to the detail page and toggle the watchlist.

## Build plan

Tracer-Bullet: complete the home themed-rows slice end to end. **No migration** (reuses the feature-8 RPC; that migration must be applied for this to run). Every task tags the AC(s) it satisfies.

1. **Rows lib** (`src/lib/rows`): `getRowPool(supabase, tasteVectorLiteral, poolSize)` — call `match_feed_candidates` directly for the larger pool, returning candidates with `movie`, cosine `score`, and `popularity`; `buildRows(pool, genreAffinities)` — slice into Hidden gems / Crowd-pleasers / More-<top-genre>, greedy-dedupe, and label each pick with `groundedReason` plus a per-row lead-in. (AC-2, AC-3, AC-4)
2. **Home rows data** (`src/app/...` home): `getHomeRows` — getUser gate; read taste vector + `genre_affinities`; if no vector return `no-profile`; else pool → `buildRows` → mark watchlist state → return rows. (AC-1, AC-5, AC-6)
3. **Home rendering** (signed-in home): render each row as a heading + a horizontally scrollable strip of `recommendation-card` (href to `/movie/[id]`, watchlist toggle), distinct from the feed grid; no-profile prompt and short/empty states, built to `design.md`. (AC-1, AC-5, AC-7)
4. **Wire end to end**: show the rows on the signed-in home alongside the existing feed/import CTAs; confirm two+ distinct rows of real, personalized, deduped picks with grounded reasons, the no-profile prompt, and the thin-pool behavior. (AC-1 through AC-7)

AC trace: AC-1→2/3; AC-2→1; AC-3→1/2; AC-4→1; AC-5→2/3; AC-6→2; AC-7→3.

## Consequences

**Positive**

- Adds several personal home surfaces on top of the existing engine with almost no new code: one shared vector query, in-app slicing, and grounded reasons.
- Fast and free to load (no Claude, no embedding; one indexed query), which is exactly right for a browse-more surface.
- Rows are real by construction and genuinely distinct from the feed (they surface what the feed's popularity tiebreak de-emphasizes), with cross-row dedupe keeping the page clean.
- Reuses the feed RPC, the taste vector, `genre_affinities`, `groundedReason`, the `recommendation-card`, the detail link, and the watchlist control.

**Negative (the honest costs)**

- The reasons are templated, not individually Claude-written, so less rich than the feed's. A deliberate cost trade for a browse surface; upgrading a row to cached Claude reasons is a Follow-up.
- All rows draw from one shared near pool, so a genre row is limited to genre matches that are also near the taste vector (not a catalog-wide genre search). Fine for "more of what you like", not a general genre browser.
- Rows need a taste vector and a reasonably embedded catalog; thin data yields short rows.

**Neutral**

- The rows are recomputed per home load rather than cached, which is cheap because there is no Claude call; if the pool query ever becomes a cost, a short-TTL cache is a drop-in.
- Row definitions (which signals, how many) are stated, tunable defaults; new rows can be added as further slices of the same pool without a migration.

## Follow-up

- [ ] Upgrade a chosen row (e.g. "Hidden gems") to cached Claude reasons if the templated line proves too generic, reusing the feed's cache pattern.
- [ ] A catalog-wide genre row (its own filtered vector query) if "more of your top genre" from the shared pool proves too narrow.
- [ ] More row types as slices of the pool: "because you liked <title>" (nearest to a single top-rated movie), "quick picks" (short runtime), "new to the catalog".
- [ ] A short-TTL cache of the pool if home-load query volume grows.
- [ ] Tune pool size, row length, and the minimum for optional rows against real data.
