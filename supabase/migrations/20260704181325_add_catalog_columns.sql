-- Movie catalog metadata (ADR 0003)
-- Extends the movies table from ADR 0002 with the fields the catalog caches from TMDB.
-- No semantic / vibe columns here; those are feature 7's boundary.

alter table public.movies
  add column imdb_id text,
  add column directors jsonb,
  add column top_cast jsonb,
  add column keywords jsonb,
  add column vote_average numeric(3, 1),
  add column vote_count integer,
  add column popularity numeric,
  add column synced_at timestamptz;

-- imdb_id is unique when present (partial index allows many nulls, one row per real IMDb id).
create unique index idx_movies_imdb_id on public.movies (imdb_id) where imdb_id is not null;

-- popularity drives seed selection, ranking, and candidate ordering.
create index idx_movies_popularity on public.movies (popularity desc nulls last);
