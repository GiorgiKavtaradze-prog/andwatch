# 0007. Recommendation feed with reasons for Reel

**Date**: 2026-07-05
**Status**: In Progress

## Summary

This decides how a signed-in user with a taste profile gets a personal feed of movie picks, each with a one-line reason. We rank the catalog by cosine similarity of each movie's embedding to the user's taste vector (using the HNSW index from ADR 0006), take the top 10 unseen real movies, and write one short reason per pick with Claude Sonnet in a single batched call. The feed is cached in a new `recommendations` table and regenerated only when the profile is recomputed or the user asks, not on every load. To build it we add one migration, a pgvector retrieval query, the Anthropic client, the batched reason writer, the generate/cache/replace logic, two server actions, and the feed page.

## Context

The real user job is to end a first session on a real, personal feed, not an empty state. Feature 7 (ADR 0006) already produces the core asset this feature consumes: a per-user taste vector in `taste_profiles.vector` and a per-movie embedding in `movies.embedding`, both `vector(1536)`, L2-normalized (unit length), with an HNSW cosine index (`vector_cosine_ops`) on the movie column. This feature is the second half of the recommendation engine (feature 8): it turns that vector into a ranked, reasoned feed. It builds directly on ADR 0006's engine and does not re-decide the vectors, the index, or the vector conventions in `src/lib/embeddings`.

The product promise is a personal feed where every title is a real movie and every pick carries a one-line reason for why it fits this person. Two things follow. First, selection must be deterministic over real catalog rows (feature 4's `movies` table), so nothing is invented, exactly as ADR 0003 requires. Second, the reason is written text, and ADR 0001 assigned the written reasons to Claude (the stronger tier, Sonnet, not the cheap Haiku used for frequent parsing). This feature honors that split: the only AI output here is the reason string, and it is grounded in the pick's real metadata plus a compact summary of the user's taste.

The feature reuses feature 4's catalog (the `Movie` type: `overview`, `genres`, `keywords`, `directors`, `top_cast`, `popularity`, `poster_path`) and feature 5's UI (the existing `recommendation-card`, `PosterImage`, `AppShell`, `ui/skeleton`, `ui/button`, `ui/card`, and the toast). It writes into a new `recommendations` cache table and reads and writes it through the user-scoped Supabase client so row-level security (RLS, per-user data ownership enforced in the database) actually runs. The feed is per-user data, never a service-key path.

> ⚠️ Premise note: five real forces to name before building, none of them blockers.
>
> 1. **A live regeneration is seconds of latency, so a stale load cannot block the render.** A Sonnet call that writes 10 reasons takes a few seconds. If the feed is stale on load, we must not block the server render on that call. The shape below serves the cached (possibly stale) feed immediately and regenerates from a client-triggered server action with a visible loading state, rather than making the page wait. A first-ever load (no cached feed yet) is the one case that shows skeletons while it generates.
> 2. **"The reason never invents facts" is prompt-enforced, not guaranteed.** The reason is free text from a model, so there is a residual risk it states something false about the movie. The mitigation is threefold: we give Claude only the pick's real metadata and instruct it to use nothing else; we steer reasons toward fit, tone, and theme (why this matches your taste) rather than hard facts (awards, box office, exact plot) that are easy to get wrong; and selection itself is deterministic SQL, so a bad reason can never smuggle in a fake movie. This is a known, bounded risk, not a silent one.
> 3. **HNSW recall depends on `ef_search`.** The index is approximate. At a low `ef_search`, a small or oddly-shaped catalog can miss a genuinely good pick that a full scan would find. We start at pgvector's default and set it explicitly per query so it is a named, tunable knob; raising it is a one-line change once we have real recall data. Retrieving a candidate pool larger than the final 10 also cushions this.
> 4. **A heavy rater with a small seeded catalog gets a thin feed.** We exclude every movie the user has already rated. A power user who imported thousands of ratings against a modestly seeded catalog may have fewer than 10 unseen embedded movies left. We show only the real picks (even 3) and never pad with off-target filler. This is a deliberate quality choice, and the thin state is a first-class UI state, not an error.
> 5. **The feed does not update as the user rates in-app.** The learning profile (re-deriving taste from in-app behavior) is deferred on the roadmap. So the feed only refreshes when the taste profile is recomputed (an import or onboarding run) or when the user hits manual refresh. Rating a movie inside the app does not, by itself, move the feed yet. We name this honestly; closing that loop is a follow-up.

## Requirements

**User stories**

- As a signed-in user with a taste profile, I want a ranked feed of movies picked for me, each with a one-line reason, so my first session ends on something personal rather than an empty state.
- As a user, I want the feed to load instantly on repeat visits without paying for a fresh AI call every time, so it is fast and cheap.
- As a user whose taste profile just changed (a new import or onboarding), I want the feed to reflect it, so my picks stay current.
- As a user, I want a refresh control so I can ask for a new set on demand.
- As a user with no taste profile, I want a clear explanation and a path to build one (import or onboarding), so I am not stuck at a dead end.
- As a user with a small unseen catalog, I want to see only the real picks that genuinely fit, not filler, so I trust the feed.

**Acceptance criteria**

- **AC-1**: A migration adds the `recommendations` table (fields, types, FKs below) with `UNIQUE (user_id, movie_id)`, an index on `(user_id, rank)`, `ON DELETE CASCADE` on `user_id`, and owner-only per-operation RLS policies keyed on `auth.uid()`; applied and confirmed live.
- **AC-2**: A signed-in user with a taste profile sees a feed of up to 10 ranked, real, unseen (not-yet-rated) movies, each backed by a real catalog row.
- **AC-3**: Ranking is by cosine similarity of `movies.embedding` to `taste_profiles.vector` (using the HNSW index), with popularity as a tiebreaker among near-equal scores; movies the user has rated are excluded, watchlisted movies may still appear, and movies with no embedding are excluded.
- **AC-4**: Each pick carries a one-line reason (about 15 words) written by Claude Sonnet, grounded in the movie's real metadata plus the user's taste signal (top genres from `genre_affinities` and a few of their highest-rated film titles); the reason never invents facts about the movie.
- **AC-5**: The feed is cached in `recommendations` and regenerated only when the taste profile is recomputed (`computed_at` newer than the feed's `generated_at`) or on manual refresh; otherwise reloads serve the cached feed with no new Claude calls.
- **AC-6**: Regeneration is atomic and fails closed: the new set is built in full, then replaces the user's rows wholesale in one step; on a generation failure the existing feed is kept and a retry is offered (a first-time failure shows an error state with retry), never a half-built feed.
- **AC-7**: A user with no taste profile sees an empty state explaining they need one, with routes to import (`/import`) and onboarding (feature 9); a user with a profile but fewer than 10 matches sees only the real picks, with no filler.
- **AC-8**: The feed page renders loading (skeletons), populated (a responsive grid of recommendation cards showing poster, title, reason, add-to-watchlist), no-profile, thin, and error states, built to `design.md`, reusing the existing `recommendation-card`.
- **AC-9**: All generation (the pgvector query, the Claude call, the writes) runs server-side; `ANTHROPIC_API_KEY` is server-only and validated at startup; the feed is read and written through the user-scoped RLS client (feed is user data, never the service key).

## Options considered

### Option 1 (chosen): cached `recommendations` table, cosine + popularity retrieval, Sonnet-written reasons, atomic replace

Rank the catalog with one pgvector cosine query against the user's taste vector (excluding rated movies and null embeddings), take the top 10 after a popularity tiebreak, write all 10 reasons in one batched Claude Sonnet call, and persist the result in a `recommendations` cache table. Regenerate only when the profile is recomputed or the user refreshes; every other load serves the cache. Replace the cached set atomically after the full new set is built.

- Pro: delivers the exact product promise (a personal, ranked, reasoned feed over real movies) and reuses ADR 0006's engine directly, matching is one pgvector query.
- Pro: caching makes the expensive step (the Sonnet call) a per-regeneration cost, not a per-load cost, so repeat visits are fast and free; the atomic replace guarantees a user never sees a half-built feed.
- Con: the most moving parts (a new AI vendor path, a retrieval query, the reason writer, the cache lifecycle, the atomic replace) and a real cost/latency per regeneration.

### Option 2: compute the feed live on every load, no cache

Run the retrieval query and the Sonnet call fresh on every visit to the feed page. No `recommendations` table.

- Pro: the simplest data model, no cache, no staleness logic, no atomic replace; the feed is always current with the latest profile.
- Con: pays a multi-second Sonnet call and its cost on every single page load, and reshuffles the picks and reasons each time so the feed is never stable, which is both expensive and a worse experience. It also risks the serverless duration limit on every render, not just on regeneration.

### Option 3: a genre-affinity / `getCandidates` feed, no embeddings, no reasons

Build the feed from feature 4's `getCandidates` database filter over `genre_affinities`, ranked by genre overlap and popularity, with a templated (non-AI) blurb instead of a written reason.

- Pro: the simplest to build, no embeddings query, no AI call, no cost; it ships fastest.
- Con: it is a different, weaker product. Genre overlap cannot express "slow-burn character studies with warm cinematography," which is exactly what the taste vector exists to capture, and a templated blurb is not the personal one-line reason the product promises. This abandons the core value, not a smaller version of it.

## Decision

**Chosen option**: Option 1: a cached `recommendations` feed, ranked by cosine similarity of `movies.embedding` to `taste_profiles.vector` with a popularity tiebreak, each pick given a one-line reason written in a single batched Claude Sonnet call, regenerated only on profile recompute or manual refresh and replaced atomically.

The RECOMMEND picks, each with a one-line why and its runner-up:

1. **Anthropic SDK, one batched Sonnet call with structured output.** Install `@anthropic-ai/sdk`; call `claude-sonnet-5` (the current Sonnet id as of this ADR; `/develop` re-verifies against the claude-api reference at build) once for all 10 picks, using structured JSON output (`output_config.format` with a JSON schema) that returns an array of `{ movie_id, reason }`, so one call fills the whole feed and cost is per-regeneration, not per-pick. A reason missing or unparseable for one movie does not drop that pick and does not fail the feed: we fall back to a short, deterministic, metadata-grounded line for that one movie (its top genres and director, e.g. "A {genre} film from {director} that fits your taste"). Runner-up: 10 separate Haiku calls (cheaper per token and simpler prompts, but 10x the calls and Haiku is the parsing tier, not the writing tier ADR 0001 assigned the reasons to).
2. **Retrieval as a Postgres RPC using the cosine operator, a candidate pool, popularity breaking near-ties.** A SQL function `match_feed_candidates(taste_vector vector, pool_size int)`, declared `security invoker` (the Postgres default, so RLS still applies and the `auth.uid()` anti-join scopes to the caller, never bypass it with `security definer`), returns the `pool_size` nearest candidates ordered by `embedding <=> taste_vector` (cosine distance under `vector_cosine_ops`, smaller is closer), filtered to non-null embeddings and anti-joined against the user's `ratings` (rated movies excluded). It sets `set local hnsw.ef_search = 40` so recall is a named, tunable knob. The caller retrieves the pool (start `pool_size = 30`), then ranks near-equal cosine scores by popularity so an obscure near-match does not outrank a popular one (this honors the chosen "popularity tiebreak" over pure cosine; the near-tie band is an MVP default, stated and tunable, see Follow-up), and takes the top 10. Runner-up: build the vector literal and run the query in app code with supabase-js (fewer moving pieces, but it cannot cleanly set `hnsw.ef_search` per query, and it pulls candidate rows to app code that the RPC can rank in the database).
3. **Reason prompt: per-movie real metadata plus a compact user taste summary, structured output keyed by movie id.** Each pick is given its title, year, overview, genres, keywords, director, and top cast; the user is summarized by their top genres (from `genre_affinities`) and 3 to 5 of their highest-rated film titles (from `ratings` joined to `movies`). The instruction: one sentence, about 15 words, why THIS film fits THIS user, grounded only in the given facts, favor fit/tone/theme over hard facts, invent nothing. Runner-up: reason from the movie metadata alone with no user summary (simpler prompt, but the reason would be generic praise, not personal, defeating the "why it fits YOU" promise).
4. **Atomic replace via a transactional RPC; staleness compared at read time; generation triggered by an explicit server action, not a blocking render, and it does not auto-retry on failure.** A SQL function `replace_recommendations`, also `security invoker` (so RLS ownership on `recommendations` applies, never `security definer` without an explicit `auth.uid()` check), deletes the user's rows and inserts the new 10 in one transaction, so a failure keeps the old feed. Staleness lives in `getFeed`: the feed is stale when there are no rows or when `taste_profiles.computed_at` is newer than `max(recommendations.generated_at)`. Generation happens in an explicit server action (`refreshFeed`) that the client leaf calls, never inside the page's server render (the Sonnet call takes seconds and would risk the serverless duration limit). **The client leaf auto-fires `refreshFeed` at most once per page mount when the feed is stale, and never auto-retries on failure** — a failed regeneration surfaces a manual retry button instead. This bounds a persistently failing generation (a broken key, an Anthropic outage) to at most one Sonnet attempt per mount rather than a re-fire loop on every stale load; a durable failure backoff (a marker so repeated mounts also stop retrying) is a Follow-up. Runner-up: regenerate lazily inside the server component on a stale load (one fewer round trip, but it blocks the render for seconds and risks the serverless duration limit on a normal page view).
5. **Server surface in `src/lib/feed` and `src/app/feed`.** `src/lib/feed` holds the internals (`matchFeedCandidates`, `writeReasons`, `generateFeed`); `src/app/feed` holds the two server actions (`getFeed` to read-or-report-staleness, `refreshFeed` to force a regeneration) and the page. Runner-up: put everything in `src/app/feed` (fewer files, but mixes reusable engine logic with route wiring, against the project's `src/lib` vs `src/app` split).
6. **No-fabrication is structural here: deterministic SQL selection, so `validateMovieIds` is not needed.** Unlike vibe search (where Claude proposes titles that must be validated), the feed's movie ids come only from a SQL query over real `movies` rows, so there is no hallucinated-title risk in selection and no `validateMovieIds` backstop is required. The only AI output is the reason text, and its truthfulness is enforced by the prompt constraint (grounded-only, fit-over-facts) named in the premise note. Runner-up: none, this is a statement of the posture, not a competing choice.
7. **Score stored as cosine similarity (`1 - distance`) as `numeric`; rank assigned 1..N by final feed order; skeletons only when there is nothing to show.** We store `score` for transparency/debug and assign `rank` from the post-tiebreak order. During a live regeneration, if a cached feed already exists we keep showing it (cards dimmed, refresh disabled with a spinner) rather than flashing skeletons; skeletons appear only on a first-ever generation with no cached feed. Runner-up: always show skeletons during regeneration (simpler, but throws away a perfectly good cached feed and makes refresh feel destructive).

## Rationale

The load-bearing force is the personal-reasoned-feed promise sitting on top of ADR 0006's engine. The taste vector and the movie embeddings already exist and are indexed for cosine search, so ranking is genuinely one pgvector query, and that is why Option 3 (genre affinity only) is rejected: it throws away the semantic signal the whole engine was built to produce and delivers a coarser product, not a lighter one. The reasons are Claude's job per ADR 0001, and ADR 0001's tier split points at Sonnet for written text (Haiku is the cheap parser), so we use Sonnet and batch all 10 reasons into one structured call to keep the cost and latency of the strong tier down.

The cache is a derived value, and the project rule is to not store a derived value without a measured need. This one clears the bar plainly: the derived value is the whole feed (10 picks plus their Sonnet-written reasons), and recomputing it on every load means a multi-second, real-money Claude call on every visit (Option 2). That is the measured need. Caching in `recommendations` turns that into a per-regeneration cost, and regenerating only when the profile actually changes (or the user asks) means most loads are a plain indexed read of 10 rows. The premise note's first force is the reason generation is an explicit server action and not a blocking render: Vercel's serverless functions have a duration limit, and a page that blocks its server render on a seconds-long Sonnet call would be both slow and fragile, so the stale-load path serves the cached feed instantly and regenerates in the background with a visible loading state.

The small-team, ship-fast force is served by leaning on what already exists: the HNSW index (ADR 0006), the `Movie` type and catalog (ADR 0003/0004), the `recommendation-card` and app shell (ADR 0005/feature 5), the three-client Supabase setup and `getUser()` gate, and the discriminated-union result pattern used across the app. The only genuinely new surface is the Anthropic path and the cache lifecycle, and both are kept small: one SDK, one batched call, one cache table, two SQL functions for the two operations that must be transactional or recall-tuned (the retrieval and the atomic replace).

## Feature design

### Data model sketch

One new table, added by an additive migration in the house style of `20260705120000_add_taste_vectors.sql` (lowercase SQL, per-operation RLS keyed on `(select auth.uid())`, `updated_at` trigger where a row mutates). Nothing else changes: `movies.embedding`, `taste_profiles.vector` / `.computed_at`, `genre_affinities`, `ratings` (with its `UNIQUE (user_id, movie_id)`), and `watchlist_items` all already exist.

```
create table public.recommendations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  movie_id      bigint not null references public.movies(id),
  rank          int not null,            -- 1..10, feed order
  score         numeric not null,        -- cosine similarity, kept for transparency/debug
  reason        text not null,           -- the one-line Claude reason (or the grounded fallback)
  generated_at  timestamptz not null default now(),
  unique (user_id, movie_id)
);
create index idx_recommendations_user_rank on public.recommendations (user_id, rank);
-- RLS: owner-only select/insert/delete (update optional), each keyed on (select auth.uid()).
```

**Staleness signal**: no extra column. The feed is stale when there are no rows for the user, or when `taste_profiles.computed_at` is newer than `max(recommendations.generated_at)` for that user.

**Retrieval query shape** (SQL function `match_feed_candidates(taste_vector vector, pool_size int)`, `security invoker`): `select id, ..., popularity, (embedding <=> $taste) as distance from movies m where m.embedding is not null and not exists (select 1 from ratings r where r.user_id = (select auth.uid()) and r.movie_id = m.id) order by m.embedding <=> $taste limit pool_size`; the function runs `set local hnsw.ef_search = 40`. The caller (start `pool_size = 30`) then breaks near-equal cosine distances by popularity (the near-tie band is a stated, tunable MVP default) and takes the top 10. Runs under the user-scoped client, and because the function is `security invoker`, RLS scopes the `ratings` anti-join to the caller and the write path stays owner-checked.

**Reason prompt inputs**: per movie — `title`, `release_year`, `overview`, `genres`, `keywords`, `directors`, `top_cast`; per user — top genres from `genre_affinities` and 3 to 5 highest-rated film titles from `ratings` joined to `movies`. Output — structured JSON `[{ movie_id, reason }]`.

### State transitions

The feed's freshness lifecycle for a signed-in user:

```
no profile ──▶ (empty state: import / onboarding)

with profile:
  absent ──▶ generating ──▶ cached (fresh)
                                 │
              profile recomputed │  (computed_at > generated_at)
                                 ▼
                              stale ──▶ regenerating ──▶ cached (fresh)
                                            │
                                   failure  ▼
                                 keep existing feed + offer retry
                                 (or, if absent, error state + retry)
```

- **absent**: no rows. First load shows skeletons and triggers `refreshFeed`.
- **cached (fresh)**: `computed_at ≤ max(generated_at)`. Served directly, no Claude call.
- **stale**: profile recomputed since the feed was built. The cached (stale) picks are served immediately; the client leaf triggers `refreshFeed`, showing the old cards dimmed with a spinner until the new set lands.
- **regenerating → failure**: `generateFeed` fails (Claude error/timeout, retrieval error, or DB error). The atomic replace never ran, so the existing feed is intact; the UI keeps it and offers retry. If there was no feed (absent), the UI shows the error state with retry. Never a half-built feed. The auto-trigger fires at most once per mount and does not loop on failure, so a persistent failure costs one attempt per mount, not a re-fire on every stale load; retry after that is a manual click.

### API surface

Internal server functions and Next.js server actions, not public REST endpoints. All user data goes through the user-scoped RLS client, gated by `getUser()`.

| Function | Module | Key inputs | Key outputs | Auth path | Key errors |
| --- | --- | --- | --- | --- | --- |
| `getFeed` | server action, `src/app/feed` | (none; user from session) | discriminated result: `{ status: 'no-profile' }` \| `{ status: 'empty' }` \| `{ status: 'ready', picks, stale }` | user-scoped (RLS), gated by `getUser()` | not signed in → redirect/401 |
| `refreshFeed` | server action, `src/app/feed` | (none; force regenerate) | `{ status: 'ready', picks }` \| `{ status: 'error' }` | user-scoped (RLS), gated by `getUser()` | no profile; generation failure → old feed kept, error returned |
| `generateFeed` | `src/lib/feed` | user id, taste vector, user taste summary | the 10 built rows (movie, rank, score, reason) or an error result | user-scoped read (ratings, taste); user-scoped write via `replace_recommendations` | Claude error/timeout; retrieval error; DB error (all fail closed) |
| `matchFeedCandidates` | `src/lib/feed` (RPC wrapper) | taste vector (as literal) | up to 30 candidate `Movie` rows with distance + popularity | user-scoped (RLS scopes the ratings anti-join) | no candidates (thin/empty catalog) |
| `writeReasons` | `src/lib/feed` | picks (per-movie metadata) + user taste summary | `Map<movie_id, reason>` (fallback line for any missing/unparseable) | server-only (`ANTHROPIC_API_KEY`) | Claude error/timeout → propagated to `generateFeed` (fail closed) |

`getFeed` reads the cache and reports staleness; it never calls Claude. `refreshFeed` calls `generateFeed`, which runs `matchFeedCandidates` → `writeReasons` → `replace_recommendations` and only writes when the full set is built. The page server-renders `getFeed`; the client leaf calls `refreshFeed` when stale or on the button.

### Key invariants

- **Never a half-built feed.** `replace_recommendations` deletes and inserts in one transaction, called only after all 10 rows (with reasons) are built. A failure anywhere before that leaves the previous feed untouched.
- **Only unseen, real movies appear.** Selection excludes the user's rated `movie_id`s and null embeddings, and every `recommendations.movie_id` is a real `movies` row (FK enforced). Watchlisted movies may appear.
- **The reason is grounded, never a fabricated fact about the movie.** Prompt-enforced (grounded-only, fit-over-facts); selection is deterministic SQL, so a bad reason can never introduce a fake title.
- **Feed is read and written through the user-scoped client.** RLS runs on every feed read and write; the service key is never on this path.
- **A taste vector must exist, or the empty state shows.** `getFeed` returns `no-profile` when `taste_profiles.vector` is null.
- **Cache is a justified derived value.** It exists only because recomputing it per load means a Sonnet call per load; it is regenerated on profile change or manual refresh.
- **Regeneration is bounded, not a loop.** The client auto-fires a stale regeneration at most once per page mount and never auto-retries on failure, so a broken key or an outage cannot re-fire the Sonnet call on every load. Both SQL functions are `security invoker`, so RLS (not the function) is what protects cross-user reads and writes.

### Security model

The `recommendations` table is user-owned data: read and written through the user-scoped Supabase client (`client.ts` / `server.ts`) so RLS enforces per-user ownership, with owner-only per-operation policies keyed on `auth.uid()`, and every server action gated by `getUser()` (never `getSession()`). The service-role client is never used on this path (it bypasses RLS). `ANTHROPIC_API_KEY` is server-only, added to `serverEnv` in `src/lib/env.ts` and validated at startup (fail loud on missing config); it never reaches the browser, and the Claude call and the pgvector query both run server-side only. This is per-user data isolation (a user's own feed), not a regulated-data compliance scope.

### Configuration required

- `ANTHROPIC_API_KEY` (server-only, validated at startup): the Anthropic key for the reason-writing Sonnet call. Already present in `.env.example`; add it to `serverEnv` in `src/lib/env.ts` alongside the existing required vars.
- Already present and reused: `SUPABASE_SECRET_KEY` (not used on this path), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `OPENAI_API_KEY`, `TMDB_API_READ_ACCESS_TOKEN`.

### Critical test scenarios

- **Happy path (AC-2, AC-3, AC-4)**: a user with a taste vector and ≥10 unseen embedded movies gets 10 ranked picks; ranking follows cosine order with popularity breaking near-ties; each pick has a ~15-word grounded reason from Sonnet. Verifies the whole thread.
- **Cached serve without regen (AC-5)**: after a feed is built, a reload with an unchanged profile serves the cached rows and makes no Claude call (assert no Anthropic request fires).
- **Regenerate on profile change and on manual refresh (AC-5)**: bump `taste_profiles.computed_at` (a re-import), reload, confirm the feed regenerates; hit the refresh button on a fresh feed, confirm it regenerates on demand.
- **Fail-closed keeps old feed (AC-6)**: force the Claude call (or `replace_recommendations`) to fail during a refresh; the previous feed is still present and intact, a retry is offered, and no partial set was written. With no prior feed, the error state with retry shows.
- **No-profile empty state (AC-7)**: a signed-in user with `taste_profiles.vector` null sees the empty state with links to `/import` and onboarding; no query or Claude call runs.
- **Thin feed shows fewer (AC-7)**: a heavy rater with only 3 unseen embedded matches sees exactly 3 real picks, no filler.
- **Rated excluded, watchlisted allowed (AC-3)**: a rated movie never appears; a watchlisted-but-unrated movie can appear.
- **Auth and secret (AC-9)**: a user cannot read another user's `recommendations` (RLS returns nothing); the feed path never uses the service key; `ANTHROPIC_API_KEY` is never exposed to the browser and the app fails at startup if it is missing.

## Build plan

Tracer-Bullet: complete Slice 1's taste-to-feed thread end to end, migration first. Every task tags the AC(s) it satisfies; every AC traces to a task.

1. **Migration** (`supabase/migrations/`, stays first): add `public.recommendations` (fields, types, FKs above) with `UNIQUE (user_id, movie_id)`, `idx_recommendations_user_rank` on `(user_id, rank)`, `ON DELETE CASCADE` on `user_id`, RLS enabled with owner-only per-operation policies keyed on `(select auth.uid())`. Apply and confirm live. (AC-1)
2. **Retrieval RPC + wrapper** (`src/lib/feed`): the `match_feed_candidates(taste_vector, ...)` SQL function (cosine `<=>`, non-null embedding, `not exists` anti-join on `ratings`, `set local hnsw.ef_search = 40`, pool of 30) plus a `matchFeedCandidates` wrapper that reads the taste vector via the user-scoped client, converts it with `toVectorLiteral`, calls the RPC, applies the epsilon popularity tiebreak, and returns the top 10 `Movie` rows with score. (AC-3)
3. **Anthropic client + batched reason writer + env** (`src/lib/feed`): install `@anthropic-ai/sdk`; add `anthropicApiKey` to `serverEnv` in `src/lib/env.ts` (validated at startup). `writeReasons` builds the per-movie metadata and the user taste summary (top genres from `genre_affinities`, 3 to 5 highest-rated titles from `ratings`⋈`movies`), calls `claude-sonnet-5` once with structured JSON output, and returns a `movie_id → reason` map with a grounded fallback line for any missing/unparseable reason. (AC-4, AC-9)
4. **Generate + cache + staleness + atomic replace** (`src/lib/feed`): `generateFeed` runs `matchFeedCandidates` → `writeReasons` → assembles the 10 rows (rank, score, reason) → writes them via the `replace_recommendations` transactional RPC (delete-then-insert in one transaction), only after the full set is built; a discriminated result on any failure leaves the old feed. Staleness helper compares `max(generated_at)` vs `taste_profiles.computed_at`. (AC-5, AC-6)
5. **`getFeed` / `refreshFeed` server actions** (`src/app/feed`): `getFeed` gates with `getUser()`, returns `no-profile` / `empty` / `ready + stale` from the cache with no Claude call; `refreshFeed` gates and forces `generateFeed`, returning the new picks or an error result. (AC-5, AC-6, AC-9)
6. **Feed page + grid + refresh + states** (`src/app/feed`): server-render `getFeed`, render a responsive grid of the existing `recommendation-card` (poster, title, reason, add-to-watchlist), a header with a manual refresh control, and the loading (skeletons), populated, no-profile (links to `/import` and onboarding), thin, and error (retry) states, built to `design.md`. A small client leaf drives `refreshFeed` on a stale load and on the button, keeping a stale feed visible (dimmed) during regeneration. (AC-7, AC-8)
7. **Wire end to end**: link the feed from the home/nav so a signed-in user with a profile lands on it; confirm the full thread (import → taste vector → feed with reasons) runs, the cached serve makes no Claude call, and the refresh and profile-change regenerations work. (AC-2 through AC-9)

AC trace: AC-1→1; AC-2→2/6; AC-3→2; AC-4→3; AC-5→4/5; AC-6→4/5; AC-7→6; AC-8→6; AC-9→3/5.

## Consequences

**Positive**

- The feed delivers the core product promise: personal, ranked over real movies, each with a one-line reason, built directly on ADR 0006's taste engine. Ranking is one indexed pgvector query.
- Caching makes the Sonnet call a per-regeneration cost, not a per-load cost, so repeat visits are a fast indexed read of 10 rows with no AI spend.
- The atomic replace guarantees the user never sees a half-built or reshuffling feed; a failed regeneration is invisible because the old feed stays.
- No-fabrication is structural: selection is deterministic SQL over real catalog rows, so unlike vibe search there is no hallucinated-title risk and no `validateMovieIds` backstop is needed on this path.
- Reuses the existing `recommendation-card`, app shell, Supabase clients, env-validation pattern, and result-shape convention, so the new surface is small.

**Negative (the honest costs)**

- Each regeneration pays a Claude Sonnet call for 10 reasons: real latency (a few seconds) and real cost. Batching into one call and caching bounds it, but it is not free.
- A stale load cannot regenerate in the blocking server render (seconds, and the serverless duration limit), so it needs a client-triggered action with a loading state, which is more moving parts than a plain page.
- The reason is prompt-grounded, not guaranteed factual. We steer toward fit/tone and give Claude only real metadata, but a wrong statement about a movie is possible; the mitigation is bounded, not absolute.
- The feed does not update as the user rates in-app until the learning profile ships (deferred); it only refreshes on import/onboarding recompute or manual refresh.
- HNSW recall depends on `ef_search`; at the default a small or oddly-shaped catalog can miss a good pick. It is a named, tunable knob, cushioned by the 30-candidate pool.
- A heavy rater against a small seeded catalog gets a thin feed (even 3 picks); a deliberate quality choice, but a real limit for early, sparsely-seeded data.
- A new AI dependency path (Anthropic) to hold, secure, and pay, on top of OpenAI, Supabase, and TMDB.
- Two open tabs each seeing a stale feed can both fire `refreshFeed`, doubling that regeneration's Sonnet spend and racing two `replace_recommendations` transactions. It is not a correctness bug (both compute deterministically over the same state, so the last commit wins and the feed converges), and the once-per-mount auto-trigger plus a disabled-while-in-flight refresh button limit it, but a true debounce (an advisory lock) is a Follow-up.

**Neutral**

- The user taste summary (top genres + highest-rated titles) fed to Claude is derived from `genre_affinities` and `ratings`; it is a hint for tone, not a hard input, consistent with treating `genre_affinities` as a cache.
- The reason model id (`claude-sonnet-5`) is the current Sonnet alias; `/develop` re-verifies it against the claude-api reference at build time, and it can change without a schema change.
- The `score` column is stored for transparency/debug and is not shown in the UI; it can feed a future re-rank or diversity pass without a migration.

## Follow-up

- [ ] In-app rating / learning profile that recomputes the taste vector from in-app behavior and refreshes the feed automatically (deferred per the roadmap; closes premise-note force 5).
- [ ] Diversity re-rank (for example MMR, maximal marginal relevance) on top of cosine + popularity, so the feed is not 10 near-identical picks.
- [ ] The secondary recommendation rows feature (feature 13) reusing this `recommendations` table and the retrieval/reason machinery for themed rows.
- [ ] `ef_search` and recall tuning against real catalog data once the catalog and query patterns are live.
- [ ] A "not interested" dismiss control that excludes a pick from future feeds, if demand appears.
- [ ] A durable failure backoff (a marker so repeated page mounts also stop auto-retrying a persistently failing generation, not just once per mount) and an advisory lock so two tabs cannot double-fire one regeneration.
- [ ] Tune the near-tie popularity band (the MVP default) against real embedding-distance distributions, alongside `ef_search` recall tuning.
- [ ] A background/scheduled regeneration (rather than lazy-on-load) if regeneration latency becomes user-visible at scale.
