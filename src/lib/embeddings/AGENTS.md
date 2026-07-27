# Embeddings and taste vectors

How Reel turns text into vectors and stores them in pgvector. The recommendation feed (feature 8) and vibe search (feature 10) read movie embeddings and the taste vector, so they must follow these conventions. Decided in [ADR 0006](../../../docs/adr/0006-csv-import-taste-profile/0006-csv-import-taste-profile.md).

## Model and shape

- Model: OpenAI `text-embedding-3-small`, 1536 dimensions (`EMBED_MODEL`, `EMBED_DIMENSIONS` in `index.ts`). New env var `OPENAI_API_KEY` (server-only, validated at startup).
- Every stored vector is L2-normalized to unit length (`l2normalize`), so cosine distance equals inner product. Normalize before storing.

## Storing and reading pgvector values (the gotcha)

- Write a vector as a string literal, `[0.1,0.2,...]` (`toVectorLiteral`), NOT a JS array. supabase-js sends JSON, and pgvector casts the string form to `vector`. A JS array is sent as a Postgres array and fails to cast.
- Read a vector back with `parseVector` (PostgREST returns the `[...]` string).
- Columns: `movies.embedding vector(1536)` (nullable) with an HNSW cosine index (`vector_cosine_ops`, `m=16`, `ef_construction=64`); `taste_profiles.vector vector(1536)` (nullable, read by `user_id`, no ANN index). Query similarity with the cosine operator against `movies.embedding`.

## Where embeddings are generated (and where they are NOT)

- Movies are embedded on the import chunk, the seed, and the backfill only (`embedMovies` / `embedMissingByIds`), written through the service client (movies are system-owned, per ADR 0003).
- The shared catalog resolver (`src/lib/catalog`) stays factual-only: it never calls OpenAI, so cache-through on a hot render path never blocks on an embedding. Do not add an embedding call to the resolver.
- A movie with a null embedding is excluded from matching, never fabricated. Fill gaps with `npm run backfill:embeddings`.

## Taste vector (`src/lib/taste`)

- `computeTasteProfile` builds one taste vector per user: a rating-weighted centroid of the user's rated-movie embeddings (each rating centered on the user's own average), unit-normalized, with a plain-mean fallback when the ratings have no spread. It needs at least `MIN_RATINGS_FOR_PROFILE` (20) matched, embedded ratings; below that it writes no vector and reports below-floor.
- Read and write user vectors and ratings through the user-scoped client so RLS runs, never the service key (per the root RLS rule).
