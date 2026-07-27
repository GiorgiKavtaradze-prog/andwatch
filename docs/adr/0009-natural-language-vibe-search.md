# 0009. Natural-language vibe search for Reel

**Date**: 2026-07-05
**Status**: In Progress

## Summary

This decides how a signed-in user describes a vibe in plain words ("slow-burn sci-fi about memory, under two hours") and gets 3 to 5 real movie picks, each with a one-line reason, personalized by their taste. We parse the query with the cheap Claude tier (Haiku) into a normalized vibe description plus optional hard facets (year range, max runtime, who is watching), embed that description with the same OpenAI model the catalog uses, and cosine-search the movie embeddings (the HNSW index from ADR 0006). When the user has a taste vector we blend it into the ranking so results lean toward their taste. Claude Sonnet then selects 3 to 5 best fits from that real shortlist and writes a reason per pick, and every returned id is validated against the catalog as a backstop. Selection is over real catalog rows the whole way, so no title is ever fabricated. It reuses the embeddings, the vector-search pattern, the Anthropic client, and the `searches` table; the only new database object is one retrieval function.

## Context

This is the second hero surface (feature 10), and it extends the same engine the feed is built on (ADR 0006 embeddings, ADR 0007 retrieval). The feed ranks the catalog by a stable per-user taste vector; vibe search ranks by an ephemeral per-query vibe, optionally nudged by that taste vector. The product promise is the same no-fabrication guarantee as everywhere else in Reel: every title shown is a real movie in the catalog (ADR 0003), and the only AI free text is the one-line reason.

ADR 0007 named the contrast directly: unlike the feed (deterministic SQL selection, no hallucination risk), vibe search is where "Claude proposes titles that must be validated." This ADR resolves that into a concrete design that keeps the guarantee structural rather than leaning on a validation backstop alone. Instead of letting Claude free-associate titles from its training memory (which can name films not in the seeded catalog and force a retry loop), we do semantic retrieval over the real embeddings first, then let Claude select and explain from that real shortlist. `validateMovieIds` (ADR 0003) stays as a belt-and-suspenders backstop, but selection is already constrained to real rows, so it should never actually drop anything.

The pieces already exist: `embedTexts` (ADR 0006) to embed the query, the HNSW cosine index and the vector-RPC pattern (ADR 0007) to search it, the Anthropic client and the tier split from ADR 0001 (Haiku parses, Sonnet writes), `validateMovieIds` for the backstop, the `searches` table (ADR 0002) to log the query and results, the `recommendation-card` to render picks, and the `VibeSearchInput` component (feature 5). So vibe search adds one retrieval function, a small `src/lib/search` module, one server action, and one page.

> ⚠️ Premise note: four real forces to name before building, none of them blockers.
>
> 1. **A search is several seconds of AI work, so it must be an explicit action with a loading state, not a blocking render.** A vibe search runs a Haiku parse, an OpenAI embed, a vector query, and a Sonnet select-and-reason call. That is a few seconds. It is a user-initiated action (they type and submit), so a visible loading state is natural and there is no page-render-blocking risk like the feed had. Cost is per-search, not per-load.
> 2. **Semantic retrieval, not genre filtering, keeps this a strong product.** ADR 0007 rejected a genre-overlap feed as a weaker product because genre tags cannot express "slow-burn character study with warm cinematography." The same logic applies here: vibe search must match on the taste vector's semantic space (embed the vibe, cosine-search), not fall back to keyword/genre filtering, or it becomes the weaker product 0007 already rejected. Hard facets (runtime, era) still filter in SQL, but the core match is semantic.
> 3. **Personalization is a nudge, not the driver.** The query is the primary signal (the user asked for a specific vibe); the taste vector is a secondary nudge so two users searching the same vibe get slightly different, personal orderings. We blend with the query weighted higher (a stated, tunable default), and a user with no taste profile still gets query-only results, so vibe search works before onboarding or import.
> 4. **The reason is prompt-grounded, same bounded risk as the feed.** The one-line reason is free text from Sonnet, grounded only in the pick's real metadata and the user's query, steered toward fit and tone over hard facts. Selection is over real rows, so a bad reason can never smuggle in a fake title. Same known, bounded risk the feed already carries.

## Requirements

**User stories**

- As a signed-in user, I want to describe a vibe in plain words and get a few real movies that fit, each with a reason, so I can find something to watch by feel rather than by browsing.
- As a user with a taste profile, I want those picks leaned toward my taste, so two people asking the same thing get personal answers.
- As a user without a profile yet, I still want vibe search to work, so it is useful before I import or onboard.
- As a user, I never want to be shown a movie that does not exist.

**Acceptance criteria**

- **AC-1**: A signed-in user submits a free-text vibe query on `/search`; the query is parsed by Claude Haiku into a normalized vibe description plus optional hard facets (year range, max runtime, audience).
- **AC-2**: The parsed vibe description is embedded (OpenAI `text-embedding-3-small`, the catalog's model) and matched against `movies.embedding` via a pgvector cosine search using the HNSW index; the hard facets (year range, max runtime) filter the shortlist in SQL.
- **AC-3**: Results are personalized when the user has a taste vector, by blending query similarity and taste similarity in the ranking (query weighted higher); a user with no taste vector still gets query-only results.
- **AC-4**: Claude Sonnet selects 3 to 5 best-fit picks from the real shortlist and writes one grounded one-line reason per pick (about 15 words, tied to the vibe and the movie's real metadata); the model may only return ids that are in the shortlist.
- **AC-5**: Every returned id is validated against the catalog (`validateMovieIds`); no title is ever fabricated. If validation drops any id, the remaining real picks are shown, never a placeholder or invented title.
- **AC-6**: Each search is logged to the `searches` table (`query_text`, `parsed_intent`, `results`) under the user-scoped RLS client; the page renders loading, results, no-results, and error states.
- **AC-7**: All parsing, embedding, retrieval, and reasoning run server-side; `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are server-only; the `searches` write and the taste-vector read go through the user-scoped RLS client, and the catalog vector search runs under a `security invoker` RPC.
- **AC-8**: The search page renders the input (reusing `VibeSearchInput`), loading, populated (a responsive grid of `recommendation-card`), no-results, and error states, built to `design.md`.

## Options considered

### Option 1 (chosen): parse (Haiku) → embed → cosine retrieval blended with taste → select + reason (Sonnet) → validate

Semantic retrieval over the real embeddings produces the shortlist; Claude selects and explains from it. Hallucination is structurally impossible (ids come from a SQL query over real rows), personalization is a taste blend, and `validateMovieIds` is a backstop that should never fire.

- Pro: guarantees 3 to 5 real, catalog-backed picks whenever the catalog has fits; reuses the embeddings, the vector-RPC pattern, the tier split, and the `searches` table; matches on the semantic space the whole engine was built for.
- Pro: works before the user has a profile (query-only), and personalizes when they do.
- Con: the most moving parts of any Reel surface (a Haiku call, an embed, a vector query, a Sonnet call) and a real per-search latency and cost.

### Option 2: Claude proposes titles from memory, then validate

One Sonnet call reads the query and returns movie titles from its training knowledge; `validateMovieIds` (after a title-to-id resolve) drops any not in the catalog.

- Pro: simplest pipeline (one AI call, no embed, no new RPC); can surface famous perfect-fit films the embeddings might rank lower.
- Con: Claude names films that may not be in the seeded catalog, so after validation you can be left with fewer than 3 picks and need a retry loop; it leans on the backstop for correctness rather than making it structural. It also ignores the taste vector unless you feed a taste summary as text, which is a weaker personalization than a vector blend.

### Option 3: pure vector search, no AI selection

Embed the query, cosine-search, return the top 5 by score with templated (non-AI) blurbs.

- Pro: cheapest and fastest (no Sonnet call); fully deterministic.
- Con: no written per-pick reason (the product promises one), and no judgment layer to honor soft constraints in the query ("nothing too violent", "good for a group") that the embedding alone cannot express. It abandons half the product.

## Decision

**Chosen option**: Option 1. Parse the vibe with Haiku, embed the normalized description, cosine-search the catalog blended with the user's taste vector, let Sonnet select 3 to 5 and write the reasons from that real shortlist, and validate the returned ids as a backstop. Log the search to `searches`.

The RECOMMEND picks, each with a one-line why and its runner-up:

1. **Parse with Haiku, structured JSON, into a vibe description plus hard facets.** ADR 0001 assigns vibe-query parsing to the cheap tier, so `parseVibe` calls `claude-haiku-4-5` with structured output returning `{ vibeText, yearFrom?, yearTo?, maxRuntimeMinutes?, audience? }`. `vibeText` is a clean, embed-friendly expansion of the mood/theme; the facets are hard filters. Runner-up: skip the parse and embed the raw query (one fewer call, but the raw query embeds less cleanly against the structured movie documents, and hard facets like "under two hours" are lost to the SQL filter).
2. **Embed the vibe description with the catalog's own model** (`embedTexts`, `text-embedding-3-small`, 1536-dim, unit-normalized). Using the same model and normalization as the movie embeddings is what makes the cosine numbers comparable. Runner-up: a different or larger embedding model (better recall in theory, but it would not share the catalog's vector space, so it cannot cosine-search the existing index).
3. **Retrieval as a new `match_vibe_candidates` RPC** (`security invoker`, `set local hnsw.ef_search`) that ranks by cosine distance to the **query** vector, returns each candidate's query distance **and** its taste distance (null when no taste vector), and filters by `release_year` range and `runtime_minutes` in SQL. The caller blends and shortlists. A separate function from `match_feed_candidates` because the inputs and filters differ (query vector primary, no rated-movie exclusion, era/runtime filters). Runner-up: reuse `match_feed_candidates` (wrong shape: it excludes rated movies and has no query vector or facet filters).
4. **Personalization by a blended re-rank, query weighted higher.** The RPC returns a pool (say 40) by query distance; the caller computes `score = 0.7 * query_similarity + 0.3 * taste_similarity` (taste term dropped to 0 when the user has no vector) and takes the top 15 as the shortlist. Weights are a stated, tunable MVP default. Runner-up: blend the two vectors into one search vector (one query, but mixing a specific vibe with a broad taste dilutes the vibe; a post-hoc re-rank keeps the query in charge).
5. **Select and reason in one Sonnet call, constrained to the shortlist.** `writeVibePicks` calls `claude-sonnet-5` with the query, the user's audience/soft constraints, and the shortlist's metadata, returning 3 to 5 `{ movie_id, reason }` where every `movie_id` must be one of the shortlist ids. Sonnet applies the soft judgment (audience, "nothing too heavy") that retrieval cannot, and writes the grounded reason. Runner-up: two calls (select, then reason) — more latency and cost for no gain, since one structured call does both.
6. **`validateMovieIds` as a backstop, not the mechanism.** The returned ids come from a shortlist that is itself a SQL query over real rows, so they are already real; we still run `validateMovieIds` and drop anything unexpected, so a prompt-format slip can never surface a fake title. Runner-up: trust the constraint and skip validation (removes the last guard on the product's core promise for a negligible saving).
7. **Log every search to `searches`** (`query_text`, `parsed_intent` as the parsed JSON, `results` as the returned picks), owner-scoped by RLS. This is the log the schema already reserved, and it enables a future "recent searches" surface without a migration. Runner-up: do not log (loses history and a cheap future feature for no real benefit).

## Rationale

The load-bearing decision is to make no-fabrication **structural**, the same way the feed does, rather than a validation cleanup after a free-associating model. That is why Option 2 is rejected: it leans on the backstop for correctness and can under-deliver after validation. Semantic retrieval over the real embeddings gives a shortlist that is real by construction and semantically on-target, and Claude's judgment is spent where it adds value: picking the best few and explaining the fit. That also honors ADR 0007's thesis (embeddings, not genre tags, are the matching substrate) so vibe search and the feed are the same engine pointed at a different query.

The tier split follows ADR 0001 exactly: Haiku for the frequent, cheap parse; Sonnet for the written selection and reasons. Personalization is a blend rather than the driver because the user asked for a specific thing; the taste vector should color the ranking, not override the request, and it must degrade cleanly to query-only for users without a profile so the feature is useful on day one. The latency and cost are real but bounded and per-search, and a search is an explicit action with a natural loading state, so unlike the feed there is no render-blocking hazard.

Everything else is reuse: the embeddings, the HNSW index and vector-RPC pattern, the Anthropic client, `validateMovieIds`, the `searches` table, the `recommendation-card`, and the `VibeSearchInput`. The only new database object is one retrieval function; the only new code is a small `src/lib/search` module, one server action, and one page.

## Feature design

### Data model

**No new table.** Vibe search reuses `searches` (ADR 0002): `{ id, user_id, query_text, parsed_intent jsonb, results jsonb, created_at }`, owner-only RLS already in place. The `results` jsonb stores the returned picks (movie id, rank, reason) for history/debug.

**One new RPC** (`match_vibe_candidates`, `security invoker`), added by an additive migration in the house style (lowercase SQL, `set search_path = ''`, schema-qualified refs, and the pgvector operator written as `operator(public.<=>)` so it resolves under the locked search path — the lesson from ADR 0007's migration):

```
match_vibe_candidates(query_vector vector, taste_vector vector, pool_size int,
                      min_year int, max_year int, max_runtime int)
  returns <movie columns> + query_distance + taste_distance
  where embedding is not null
    and (min_year   is null or release_year    >= min_year)
    and (max_year   is null or release_year    <= max_year)
    and (max_runtime is null or runtime_minutes <= max_runtime)
  order by embedding operator(public.<=>) query_vector
  limit pool_size;  -- sets local hnsw.ef_search; taste_distance null when taste_vector is null
```

The caller blends `query_similarity` (`1 - query_distance`) and `taste_similarity` (`1 - taste_distance`, or 0 when null) into `score` and shortlists the top 15.

### Pipeline

```
query text ─▶ parseVibe (Haiku, structured)
                 │  { vibeText, yearFrom?, yearTo?, maxRuntimeMinutes?, audience? }
                 ▼
           embed vibeText (OpenAI) ─▶ query vector
                 │
                 ▼
       read taste vector (user-scoped)          match_vibe_candidates(query_vec, taste_vec, facets)
                 │                                          │  pool of 40 real rows
                 └──────────────────┬───────────────────────┘
                                    ▼
                        blend + shortlist (top 15)
                                    ▼
              writeVibePicks (Sonnet, structured, ids ∈ shortlist) ─▶ 3..5 { movie_id, reason }
                                    ▼
                        validateMovieIds backstop ─▶ real picks
                                    ▼
                        log to searches ─▶ return picks
```

### API surface

Internal server functions and one Next.js server action. User data (taste read, `searches` write) through the user-scoped RLS client, gated by `getUser()`.

| Function | Module | Key inputs | Key outputs | Auth path | Key errors |
| --- | --- | --- | --- | --- | --- |
| `searchVibe` | server action, `src/app/search` | `query: string` | `{ status: 'ok'; picks }` \| `{ status: 'empty' }` \| `{ status: 'error'; message }` | user-scoped (RLS) taste read + `searches` write; gated by `getUser()` | not signed in; empty query; AI/embed failure |
| `parseVibe` | `src/lib/search` | `query` | `VibeIntent` (`vibeText`, facets) | server-only (`ANTHROPIC_API_KEY`, Haiku) | Claude error → propagated |
| `matchVibeCandidates` | `src/lib/search` | query vector, taste vector or null, facets | shortlist of `Movie` + blended score | user-scoped (RLS) via the RPC | no candidates → empty |
| `writeVibePicks` | `src/lib/search` | query, audience, shortlist metadata | 3..5 `{ movie_id, reason }` (ids ∈ shortlist) | server-only (`ANTHROPIC_API_KEY`, Sonnet) | Claude error; unparseable → propagated |

`searchVibe` orchestrates parse → embed → match → select → validate → log and returns the picks. `empty` covers both "no shortlist" (catalog has no fits) and "validation left nothing".

### Key invariants

- **Only real, catalog-backed movies are ever returned.** The shortlist is a SQL query over real `movies` rows; Sonnet may only return shortlist ids; `validateMovieIds` drops anything else. No fabricated title can reach the user.
- **The reason is grounded, never a fabricated fact.** Prompt-enforced (grounded-only, fit-over-facts); selection is over real rows, so a bad reason cannot introduce a fake title.
- **Personalization degrades cleanly.** No taste vector → taste term is 0 → query-only ranking; the feature works pre-profile.
- **User data through the user-scoped client.** The taste read and the `searches` write run under RLS; the service key is never on this path. The catalog vector search is a `security invoker` RPC, so RLS still governs it.
- **Keys are server-only.** `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` never reach the browser; all AI and embedding calls are server-side.

### Security model

The taste read and `searches` write are user-owned data through the user-scoped client (`server.ts`), gated by `getUser()`. `match_vibe_candidates` is `security invoker` (RLS applies; the catalog is readable by any authenticated user by policy). `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are server-only in `serverEnv` (validated at startup); the service key is not used on this path. Per-user data isolation (a user's own search log), not a regulated-data scope.

### Configuration required

- None new. Reuses `ANTHROPIC_API_KEY` (Haiku parse + Sonnet select/reason) and `OPENAI_API_KEY` (query embed), both already in `serverEnv`.

### Critical test scenarios

- **Happy path (AC-1..AC-5)**: a rich vibe query returns 3 to 5 real picks, each with a ~15-word grounded reason; ranking reflects the query, nudged by taste for a profiled user.
- **Facet filter (AC-2)**: "under 90 minutes, from the 90s" excludes longer or out-of-era movies from the shortlist.
- **No profile (AC-3)**: a user with no taste vector gets query-only results (no error, no empty).
- **Personalization (AC-3)**: two users with different taste vectors get different orderings for the same query.
- **No fits (AC-5, AC-6)**: a query with no catalog matches returns the no-results state, not a fabricated title; the search is still logged.
- **Backstop (AC-5)**: if the model returns an id not in the shortlist, it is dropped; the remaining real picks show.
- **Auth and secrets (AC-7)**: signed-out users cannot search; the `searches` write is owner-scoped by RLS; keys never reach the browser.

## Build plan

Tracer-Bullet: complete Slice 3's vibe-search thread end to end, migration first. Every task tags the AC(s) it satisfies.

1. **Migration** (`supabase/migrations/`, first): `match_vibe_candidates(query_vector, taste_vector, pool_size, min_year, max_year, max_runtime)` `security invoker`, cosine on the query vector via `operator(public.<=>)`, returns query + taste distance, year/runtime SQL filters, `set local hnsw.ef_search`. Apply and confirm live. (AC-2, AC-3)
2. **Parse + embed** (`src/lib/search`): `parseVibe(query)` — Haiku (`claude-haiku-4-5`) structured JSON → `VibeIntent { vibeText, yearFrom?, yearTo?, maxRuntimeMinutes?, audience? }`; embed `vibeText` with `embedTexts`. (AC-1)
3. **Retrieval + blend wrapper** (`src/lib/search`): `matchVibeCandidates(supabase, queryVectorLiteral, tasteVectorLiteral|null, facets)` — call the RPC, blend `0.7*query + 0.3*taste` similarity (taste 0 when null), shortlist top 15 `Movie` rows. (AC-2, AC-3)
4. **Select + reason** (`src/lib/search`): `writeVibePicks(query, audience, shortlist)` — Sonnet (`claude-sonnet-5`) structured JSON returning 3..5 `{ movie_id, reason }` constrained to shortlist ids, grounded in the vibe + metadata; then `validateMovieIds` backstop. (AC-4, AC-5)
5. **`searchVibe` server action + orchestration** (`src/app/search`): getUser gate; read taste vector; run parse → embed → match → select → validate; log to `searches`; return `ok`/`empty`/`error`. (AC-1 through AC-7)
6. **Search page + input + states** (`src/app/search`): a client leaf using `VibeSearchInput`, a results grid of `recommendation-card`, and loading/results/no-results/error states, built to `design.md`. (AC-8)
7. **Wire end to end**: link search from the app nav/home; confirm a query returns validated, personalized picks with reasons, the facet filter works, the no-profile path works, and no-results renders. (AC-1 through AC-8)

AC trace: AC-1→2; AC-2→1/3; AC-3→1/3; AC-4→4; AC-5→4; AC-6→5/6; AC-7→1/4/5; AC-8→6.

## Consequences

**Positive**

- Delivers the second hero surface on the same engine as the feed: semantic retrieval over real embeddings, personalized by the taste vector, with a written reason per pick.
- No-fabrication is structural, not a cleanup: the shortlist is real by construction and Claude only selects from it, with `validateMovieIds` as a guard that should never fire.
- Works before the user has a profile (query-only) and personalizes once they do.
- Reuses embeddings, the vector-RPC pattern, the tier split, `validateMovieIds`, the `searches` table, the `recommendation-card`, and `VibeSearchInput`; one new RPC is the only new database object.

**Negative (the honest costs)**

- The most moving parts of any Reel surface: a Haiku call, an embed, a vector query, and a Sonnet call per search, so real latency (a few seconds) and real cost per search. Bounded because it is an explicit, user-initiated action.
- The reason is prompt-grounded, not guaranteed factual (same bounded risk as the feed).
- A thin or sparsely-embedded catalog yields few or no fits; vibe search then shows the honest no-results state.
- Two AI dependencies on this path (Anthropic for parse + reason, OpenAI for the query embed) plus the DB.

**Neutral**

- The blend weights (0.7/0.3), pool (40), and shortlist (15) are stated, tunable MVP defaults; they can change without a schema change.
- The `searches` log opens a cheap future "recent searches" surface without a migration.
- `audience` is honored by Sonnet's selection judgment, not a SQL filter (the catalog has no content-rating column); a hard filter can be added later if a ratings source is seeded.

## Follow-up

- [ ] Tune the blend weights, pool, and shortlist sizes, and `hnsw.ef_search`, against real query and recall data.
- [ ] A "recent searches" surface reading the `searches` log.
- [ ] A hard content-rating / audience filter once a ratings source is added to the catalog.
- [ ] Caching identical recent queries per user to skip the AI round trip.
- [ ] Optional query-expansion with a couple of retrieved exemplars fed back to the parse, if recall on terse queries proves weak.
