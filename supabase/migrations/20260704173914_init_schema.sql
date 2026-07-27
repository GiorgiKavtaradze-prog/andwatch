-- Reel core data model (ADR 0002)
-- Seven tables plus row-level security, the profile auto-create trigger, and updated_at triggers.
-- Vector columns (movies.embedding, taste_profiles.vector) are intentionally NOT here; feature 7 adds them.

-- ============================================================
-- Shared trigger function: keep updated_at current on every update
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- profiles  (app-level user, 1:1 with auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ============================================================
-- movies  (shared read-only TMDB cache; feature 4 extends)
-- id is the TMDB id (natural key).
-- ============================================================
create table public.movies (
  id bigint primary key,
  title text not null,
  release_year int,
  overview text,
  poster_path text,
  genres jsonb,
  runtime_minutes int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger movies_set_updated_at
before update on public.movies
for each row execute function public.set_updated_at();

-- ============================================================
-- imports  (CSV import jobs: retry, resume, idempotency)
-- Declared before ratings because ratings.import_id references it.
-- ============================================================
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('letterboxd', 'imdb')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  total_rows int,
  matched_rows int,
  unmatched_rows int,
  unmatched jsonb, -- raw rows that failed matching, retained for review
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger imports_set_updated_at
before update on public.imports
for each row execute function public.set_updated_at();

-- ============================================================
-- ratings  (all taste signal: imports and onboarding folded in)
-- ============================================================
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  movie_id bigint not null references public.movies (id),
  source text not null check (source in ('letterboxd', 'imdb', 'onboarding')),
  raw_value numeric,
  raw_scale text,
  normalized_value integer not null check (normalized_value between 0 and 100),
  rated_at timestamptz,
  import_id uuid references public.imports (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, movie_id)
);

-- ============================================================
-- taste_profiles  (one per user, 1:1)
-- ============================================================
create table public.taste_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  genre_affinities jsonb,
  rating_count integer not null default 0,
  computed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger taste_profiles_set_updated_at
before update on public.taste_profiles
for each row execute function public.set_updated_at();

-- ============================================================
-- watchlist_items  (saved movies)
-- ============================================================
create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  movie_id bigint not null references public.movies (id),
  added_at timestamptz not null default now(),
  unique (user_id, movie_id)
);

-- ============================================================
-- searches  (vibe-search log plus results)
-- ============================================================
create table public.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  query_text text not null,
  parsed_intent jsonb,
  results jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Indexes
-- The unique (user_id, movie_id) constraints on ratings and watchlist_items
-- already index the user_id prefix, so no separate user_id index is needed there.
-- ============================================================
create index idx_ratings_movie_id on public.ratings (movie_id);
create index idx_ratings_import_id on public.ratings (import_id);
create index idx_imports_user_id on public.imports (user_id);
create index idx_searches_user_created on public.searches (user_id, created_at desc);

-- ============================================================
-- Profile auto-creation on sign-up
-- SECURITY DEFINER so the insert runs as the function owner and is not blocked
-- by the (deliberately absent) user INSERT policy on profiles.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- Row-level security
-- ============================================================

-- profiles: owner reads and updates own row; insert is the trigger's job; no user delete.
alter table public.profiles enable row level security;

create policy "profiles_select_own"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "profiles_update_own"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- movies: readable by every authenticated user; writes are service/system only (no user write policy).
alter table public.movies enable row level security;

create policy "movies_select_authenticated"
on public.movies for select to authenticated
using (true);

-- ratings: owner may read, insert, update, delete own rows. INSERT and UPDATE both needed for upsert.
alter table public.ratings enable row level security;

create policy "ratings_select_own"
on public.ratings for select to authenticated
using (user_id = (select auth.uid()));

create policy "ratings_insert_own"
on public.ratings for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "ratings_update_own"
on public.ratings for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "ratings_delete_own"
on public.ratings for delete to authenticated
using (user_id = (select auth.uid()));

-- taste_profiles: owner full access to own row.
alter table public.taste_profiles enable row level security;

create policy "taste_profiles_select_own"
on public.taste_profiles for select to authenticated
using (user_id = (select auth.uid()));

create policy "taste_profiles_insert_own"
on public.taste_profiles for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "taste_profiles_update_own"
on public.taste_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "taste_profiles_delete_own"
on public.taste_profiles for delete to authenticated
using (user_id = (select auth.uid()));

-- watchlist_items: owner full access to own rows.
alter table public.watchlist_items enable row level security;

create policy "watchlist_items_select_own"
on public.watchlist_items for select to authenticated
using (user_id = (select auth.uid()));

create policy "watchlist_items_insert_own"
on public.watchlist_items for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "watchlist_items_update_own"
on public.watchlist_items for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "watchlist_items_delete_own"
on public.watchlist_items for delete to authenticated
using (user_id = (select auth.uid()));

-- searches: owner full access to own rows.
alter table public.searches enable row level security;

create policy "searches_select_own"
on public.searches for select to authenticated
using (user_id = (select auth.uid()));

create policy "searches_insert_own"
on public.searches for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "searches_update_own"
on public.searches for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "searches_delete_own"
on public.searches for delete to authenticated
using (user_id = (select auth.uid()));

-- imports: owner full access to own rows.
alter table public.imports enable row level security;

create policy "imports_select_own"
on public.imports for select to authenticated
using (user_id = (select auth.uid()));

create policy "imports_insert_own"
on public.imports for insert to authenticated
with check (user_id = (select auth.uid()));

create policy "imports_update_own"
on public.imports for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "imports_delete_own"
on public.imports for delete to authenticated
using (user_id = (select auth.uid()));
