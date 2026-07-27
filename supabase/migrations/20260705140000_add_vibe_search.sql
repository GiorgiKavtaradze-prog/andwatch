-- Vibe search retrieval (ADR 0009)
-- Ranks the catalog by cosine similarity of each movie's embedding to a query vector (the
-- embedded, parsed vibe), and also returns each candidate's distance to the user's taste vector
-- so the caller can blend query relevance with personal taste. Hard facets (year range, max
-- runtime) filter in SQL. No new table: this reuses movies.embedding + the HNSW index from
-- ADR 0006 and logs results into the existing searches table.
--
-- security invoker (the default) so RLS still applies; the catalog is readable by any
-- authenticated user by policy. The pgvector operator is written as operator(public.<=>) so it
-- resolves under the locked empty search_path (the lesson from ADR 0007's migration, where the
-- vector type/operators live in the public schema on this database).

create or replace function public.match_vibe_candidates(
  query_vector vector,
  taste_vector vector,
  pool_size int,
  min_year int,
  max_year int,
  max_runtime int
)
returns table (
  id            bigint,
  title         text,
  release_year  int,
  overview      text,
  poster_path   text,
  genres        jsonb,
  runtime_minutes int,
  imdb_id       text,
  directors     jsonb,
  top_cast      jsonb,
  keywords      jsonb,
  vote_average  numeric,
  vote_count    integer,
  popularity    numeric,
  synced_at     timestamptz,
  query_distance double precision,
  taste_distance double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.id, m.title, m.release_year, m.overview, m.poster_path, m.genres,
    m.runtime_minutes, m.imdb_id, m.directors, m.top_cast, m.keywords,
    m.vote_average, m.vote_count, m.popularity, m.synced_at,
    (m.embedding operator(public.<=>) query_vector) as query_distance,
    case
      when taste_vector is null then null
      else (m.embedding operator(public.<=>) taste_vector)
    end as taste_distance
  from public.movies m
  where m.embedding is not null
    and (min_year is null or m.release_year >= min_year)
    and (max_year is null or m.release_year <= max_year)
    and (max_runtime is null or m.runtime_minutes <= max_runtime)
  order by m.embedding operator(public.<=>) query_vector
  limit pool_size;
$$;
