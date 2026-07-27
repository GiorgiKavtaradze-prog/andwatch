-- Taste engine vectors (ADR 0006)
-- Adds the two pgvector columns ADR 0002 deferred to this feature: a per-movie
-- embedding (a list of numbers that places similar movies near each other) and a
-- per-user taste vector, plus the HNSW index the recommendation feed queries.
-- Embeddings come from OpenAI text-embedding-3-small (1536 dims), stored L2-normalized
-- (unit length) so cosine distance and inner product agree.

-- pgvector provides the `vector` column type and the similarity operators.
-- `if not exists` is a no-op if the extension is already enabled (e.g. in the
-- extensions schema on a managed Supabase project).
create extension if not exists vector;

-- Per-movie embedding. Nullable: null means "not yet embedded", and such a movie is
-- excluded from matching, never fabricated. Written only through the service path.
alter table public.movies
  add column embedding vector(1536);

-- Per-user taste vector. Nullable: null means "no profile yet" (below the rating floor,
-- or not computed). Read by user_id (its table's PK), never similarity-searched, so it
-- gets no ANN index.
alter table public.taste_profiles
  add column vector vector(1536);

-- HNSW index for cosine similarity on the movie embeddings (the feed's search target).
-- m = 16 and ef_construction = 64 are pgvector's defaults, a sound start for a catalog of
-- tens of thousands of movies; runtime ef_search can be tuned up later against a recall
-- check. 1536 dimensions is within pgvector's 2000-dim HNSW limit.
create index idx_movies_embedding_hnsw
  on public.movies
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
