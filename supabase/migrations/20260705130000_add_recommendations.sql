-- Recommendation feed cache (ADR 0007)
-- One row per (user, movie) pick in a user's cached feed. The feed is a derived value
-- (10 picks plus a Claude-written reason each) that is expensive to recompute, so it is
-- cached here and regenerated only when the taste profile changes or the user refreshes.
-- Selection is deterministic SQL over real movies (see match_feed_candidates below), so a
-- recommendation always points at a real movie; only the reason text is AI-written.

create table public.recommendations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  movie_id      bigint not null references public.movies (id),
  rank          int not null,            -- 1..N, feed order
  score         numeric not null,        -- cosine similarity, kept for transparency/debug
  reason        text not null,           -- the one-line Claude reason (or the grounded fallback)
  generated_at  timestamptz not null default now(),
  unique (user_id, movie_id)
);

-- Feed reads always scope by user and order by rank, so index that prefix.
create index idx_recommendations_user_rank on public.recommendations (user_id, rank);

-- ============================================================
-- Row-level security: owner-only, per operation, keyed on (select auth.uid()).
-- The feed is user data, read and written only through the user-scoped client.
-- ============================================================
alter table public.recommendations enable row level security;

create policy "recommendations_select_own"
on public.recommendations for select to authenticated
using (user_id = (select auth.uid()));

create policy "recommendations_insert_own"
on public.recommendations for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "recommendations_delete_own"
on public.recommendations for delete to authenticated
using (user_id = (select auth.uid()));

-- ============================================================
-- Retrieval: nearest unseen embedded movies to the taste vector (ADR 0007).
-- security invoker (the default) so RLS still applies and the ratings anti-join is scoped
-- to the caller by (select auth.uid()) — never security definer, which would bypass it.
-- set local hnsw.ef_search makes recall a named, tunable knob (transaction-scoped).
-- Ordered by cosine distance (embedding <=> taste, smaller is closer). The caller applies
-- the popularity tiebreak among near-equal scores and takes the top 10.
-- ============================================================
create or replace function public.match_feed_candidates(taste_vector vector, pool_size int)
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
  distance      double precision
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
    (m.embedding operator(public.<=>) taste_vector) as distance
  from public.movies m
  where m.embedding is not null
    and not exists (
      select 1 from public.ratings r
      where r.user_id = (select auth.uid())
        and r.movie_id = m.id
    )
  order by m.embedding operator(public.<=>) taste_vector
  limit pool_size;
$$;

-- ============================================================
-- Atomic feed replace (ADR 0007): delete the user's rows and insert the new set in one
-- transaction, so a failure mid-build never leaves a half-written feed. security invoker so
-- the RLS owner-checks on recommendations apply (delete_own / insert_own). Called only after
-- the full set (with reasons) is assembled in app code. rows is a jsonb array of
-- { movie_id, rank, score, reason }.
-- ============================================================
create or replace function public.replace_recommendations(rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.recommendations where user_id = uid;

  insert into public.recommendations (user_id, movie_id, rank, score, reason)
  select
    uid,
    (row ->> 'movie_id')::bigint,
    (row ->> 'rank')::int,
    (row ->> 'score')::numeric,
    row ->> 'reason'
  from jsonb_array_elements(rows) as row;
end;
$$;
