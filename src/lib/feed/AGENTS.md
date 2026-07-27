# Recommendation engine (feed, secondary rows, vibe search)

The three surfaces that turn the taste vector and the movie embeddings into picks with reasons. They share the conventions below, so a change to one usually touches the others. Read this alongside [src/lib/embeddings/AGENTS.md](../embeddings/AGENTS.md) (the vector conventions these build on).

- **Feed** (`src/lib/feed`, `src/app/feed`) — the ranked personal feed, cached in `recommendations`. [ADR 0007](../../../docs/adr/0007-recommendation-feed-reasons/0007-recommendation-feed-reasons.md).
- **Secondary rows** (`src/lib/rows`, `src/app/home-rows.tsx`) — themed home rows, distinct slices of the same taste vector. [ADR 0010](../../../docs/adr/0010-secondary-recommendation-rows.md).
- **Vibe search** (`src/lib/search`, `src/app/search`) — free-text query → real picks. [ADR 0009](../../../docs/adr/0009-natural-language-vibe-search.md).

## Retrieval (pgvector RPCs)

- Ranking is a Postgres function, not app-side math. `match_feed_candidates(taste_vector, pool_size)` serves the feed AND the home rows (rows reuse it with a larger pool). `match_vibe_candidates(query_vector, taste_vector, pool_size, min_year, max_year, max_runtime)` serves vibe search. Reuse these before adding a new one.
- Pass the taste vector as its **stored pgvector text literal** (the `[...]` string PostgREST returns from `taste_profiles.vector`) straight into the RPC. Do not parse-and-re-normalize it; it is already a unit vector.
- Both RPCs are `security invoker` (never `security definer`), so RLS still runs and the rated-movie anti-join is scoped to the caller by `(select auth.uid())`. Call them through the user-scoped client.
- **The pgvector operator MUST be written `operator(public.<=>)` inside these functions.** They run under `set search_path = ''`, and on this database the `vector` type and its operators live in the `public` schema, so a bare `<=>` fails to resolve at apply time (error `42883: operator does not exist`). Schema-qualified table refs still work; only the operator needs the explicit form.

## AI: the tier split and the shared client

- One shared Anthropic client: `getAnthropic()` in [../anthropic.ts](../anthropic.ts) (server-only, reads `ANTHROPIC_API_KEY`).
- Tier split (ADR 0001): **Haiku parses, Sonnet writes.** Vibe query parsing uses `claude-haiku-4-5` (`src/lib/search/parse.ts`); every written reason uses `claude-sonnet-5` (feed `writeReasons`, vibe `writeVibePicks`).
- All model calls use structured output (`output_config: { format: { type: "json_schema", schema } }`) and `thinking: { type: "disabled" }` (these are short JSON replies). JSON schemas use nullable-plus-required fields for optional values and `additionalProperties: false`.
- **Reasons are expensive, so cache or ground them.** The feed writes Sonnet reasons once per regeneration and caches them in `recommendations`. Vibe search writes them per search (an explicit, user-initiated action). The home rows do NOT call Claude at all: they use `groundedReason(movie)` (deterministic, metadata-based). Do not add a per-load Claude call to the rows path.
- No fabrication is structural, not a cleanup: selection is always a SQL query over real `movies` rows, and the model may only return ids from the real shortlist you gave it. `validateMovieIds` is a backstop on the vibe path, not the mechanism.

## Client-safety: import the leaf, not the barrel

Client components must NOT import a lib barrel (`@/lib/feed`, `@/lib/search`, `@/lib/rows`) — those re-export server-only modules (Anthropic, OpenAI, the service client), and pulling them into a browser bundle throws at load (`Missing required environment variable: ...`, because `env.ts` reads `process.env[name]` dynamically, which Next cannot inline client-side). Import the **server-free leaf** instead:

- `@/lib/feed/types`, `@/lib/search/types`, `@/lib/rows/types`, `@/lib/onboarding/constants`.

Those leaves carry only the shared types and constants (type-only `Movie` import). The barrels export only server pieces and deliberately do NOT re-export their `types`/`constants` leaf, to keep this boundary clear.

## Migrations are an operator step

The RPCs live in `supabase/migrations/` but there is no in-repo apply. After adding or changing one, it must be applied by hand (Supabase SQL editor, or `npx supabase db push`) and confirmed live before the feature works. Each engine feature ships a `verify.md` beside its ADR listing the apply step. `ANTHROPIC_API_KEY` must be set (server-only, validated at startup) or the app fails loud.

## Watchlist

Add/remove and list live in [../../app/watchlist/actions.ts](../../app/watchlist/actions.ts) (`setWatchlist`, `getWatchlist`), used by the feed, vibe search, the detail page, and the watchlist page. Watchlist is user data, so it goes through the user-scoped client. Reuse these rather than writing `watchlist_items` inline.
