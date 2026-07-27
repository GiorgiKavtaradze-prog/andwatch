# 0002. Core data model for Reel

**Date**: 2026-07-04
**Status**: Accepted

## Summary

This decision fixes the seven tables Reel is built on (profiles, movies, ratings, taste_profiles, watchlist_items, searches, imports) and how they relate. It is a normalized relational schema in Supabase Postgres, with row-level security (RLS, database-enforced per-user access) on every user-owned table and a shared read-only movies cache. Vector columns are deliberately left out for now so a later feature can add them once the embedding model is chosen. To build it is one migration plus RLS policies, applied and confirmed live in the database.

## Context

I checked the confirmed model against first principles and it holds. Nothing below invents a problem to look clever. There are three honest tradeoffs to name, not to fix, and I record them in Consequences rather than pretend them away.

Reel is a login-walled movie recommendation app. Every screen sits behind auth, and each user's imported ratings, taste profile, watchlist, and vibe searches are private to that user. Per-user isolation is a hard requirement, enforced in the database by RLS, not just in app code.

What the data foundation has to serve:

- A single home for taste signal. Ratings arrive three ways (a Letterboxd CSV, an IMDb CSV, and onboarding swipes) but they are the same thing once stored: this user rated this movie this much. The model must fold all three into one place so the taste engine reads one table.
- Safe, resumable imports. A CSV can be large and an import can fail halfway. The model needs a record of each import job (its status and row counts) and a link from each rating back to the import that produced it, so a failure can be resumed and reconciled. This requirement comes from ADR 0001.
- A taste engine that will need vectors later, but not yet. The embedding model and the vector dimension are owned by a later feature. Committing to a dimension now would be guessing. The relational shape has to stay stable so that adding a vector column later is a plain additive migration, not a breaking change.
- A movie cache other tables can point at, without owning catalog mechanics. Ratings and watchlist rows reference movies. But TMDB sync, freshness, and validation belong to a later feature. This feature defines only the minimal movies table those references need.
- Ship fast, small team. Fewer tables, invariants enforced by the database (unique constraints, foreign keys, NOT NULL, CHECK), and standard Supabase patterns beat anything bespoke.

On the three tradeoffs I checked:

- Deferring the vector columns is safe. A pgvector column is nullable and additive. Nothing about the relational shape here (the keys, the foreign keys, the RLS policies) has to change when feature 7 runs `alter table movies add column embedding vector(N)` and the same on taste_profiles. So deferring is genuinely non-breaking, and it avoids locking a dimension before the model that produces it is picked.
- Using the TMDB id as the movies primary key couples our primary key to an external id. That is a real coupling. It is also the correct pattern for a cache of an external catalog: the TMDB id is stable, unique, and is exactly the key every import row and API lookup already carries, so a surrogate key would add a join and a second unique index to buy back nothing at this stage. I name the coupling and note feature 4 may revisit it.
- Storing search results as jsonb (a JSON blob in one column) means the results are not queryable per result. We cannot cheaply ask "how many times was movie X recommended across all searches" without unpacking JSON. For an MVP that treats a search as a logged event with its answer attached, that is the right call. If per-result analytics become a real need, that is a later normalization, not a thing to pay for now.

## Requirements

**User stories**

- As a user, my ratings, taste profile, watchlist, and searches are private to me. No other user can read or change them.
- As a user, I can import my Letterboxd or IMDb history and, if the import fails partway, resume it without duplicate ratings.
- As a user, my onboarding swipes count as ratings, so my taste profile starts forming immediately.
- As the system, I can read the whole movie cache for every signed-in user, but only service or system paths may write to it.
- As the system, when a user account is deleted, every row that user owned is deleted with it, leaving nothing orphaned.

**Acceptance criteria**

- AC-1: The schema defines all seven entities with the fields, types, nullability, and FK relationships above, applied as a migration and confirmed live in the database.
- AC-2: RLS is enabled on all user-owned tables (profiles, ratings, taste_profiles, watchlist_items, searches, imports); a user can read and write only their own rows. `movies` is readable by every authenticated user and not writable by them (writes are service/system only).
- AC-3: ratings is unique per (user_id, movie_id); re-importing the same movie upserts (latest wins), never duplicates.
- AC-4: Deleting a user (auth.users row) cascades to profiles and all owned rows (ratings, taste_profiles, watchlist_items, searches, imports); no orphaned rows remain.
- AC-5: ratings stores both the raw value and scale and a normalized 0 to 100 value; onboarding swipes are stored as ratings with source = onboarding.
- AC-6: imports records each CSV import with a status and row counts, and ratings carry the import_id that produced them, so a mid-import failure can be resumed and reconciled. Rows that fail matching are retained in `imports.unmatched` (not silently dropped) so they can be surfaced for review.
- AC-7: The pgvector columns (movies.embedding, taste_profiles.vector) are intentionally absent from this migration, and the schema is shaped so feature 7 can add them without a breaking change.

## Options considered

### Option 1 (chosen): the normalized relational schema above

Seven focused tables. One ratings table carries every taste signal, tagged by source. movies is a minimal shared cache. Vector columns are deferred. Invariants live in the database.

- Pro: each table means one thing, so later features read an obvious shape.
- Pro: the database enforces the rules (unique per user per movie, foreign keys, normalized value range), so bad data cannot get in through any code path.
- Con: more tables than a flattened design, so slightly more migration surface up front.

### Option 2: one wide user_movies table with a status enum

Collapse ratings, watchlist, and a future "seen" flag into a single user_movies row per (user, movie), with a status column and a nullable rating.

- Pro: fewer tables, and one row holds everything about a user-and-movie pair.
- Con: it overloads unrelated concerns. A watchlist add and a rating are different events with different lifecycles (a watchlist item has no scale or import lineage; a rating has no "want to watch" meaning). Folding them forces nullable columns that are meaningful for one state and meaningless for another, and it muddies the import-lineage story that ratings needs. The apparent saving is paid back in confusion.

### Option 3: store the vectors now with a fixed dimension

Add movies.embedding and taste_profiles.vector in this migration with a chosen dimension.

- Pro: one fewer migration later, and the taste engine has its columns from day one.
- Con: it locks the vector dimension before the embedding model is chosen. If feature 7 picks a model with a different dimension, we rewrite the column and every row. Committing now is guessing, and a nullable vector column is a trivial additive migration later, so there is nothing to buy by rushing it.

## Decision

**Chosen option**: Option 1: the normalized relational schema.

Build the seven tables as confirmed, enforce every invariant in the database, enable RLS on all user-owned tables with a read-all policy on movies, and leave the vector columns for feature 7 to add.

**RECOMMEND picks (decided here):**

- Enum implementation: `text` plus a `CHECK` constraint, for `ratings.source`, `imports.source`, and `imports.status`. Runner-up: a native Postgres `ENUM` type. A CHECK is far easier to evolve. Adding or changing an allowed value is one `alter table ... drop constraint / add constraint`, whereas a native enum needs `alter type` (and removing a value is effectively not supported without a type rebuild). At this scale the CHECK gives the same safety with none of the rigidity.
- movies primary key: the TMDB id as a natural `bigint` primary key (the confirmed choice). Runner-up: a surrogate `uuid` with a unique `tmdb_id`. The TMDB id is stable and is the key every import and lookup already carries, so a surrogate adds a join and a second index for no present gain. Noted: feature 4 owns the catalog and may revisit this; we do not change it silently.
- Profile auto-creation: a Postgres trigger on `auth.users` insert that creates the matching `profiles` row (the standard Supabase `handle_new_user` pattern). Runner-up: an app-side upsert on first login. The trigger guarantees a profile exists the instant an account does, so no code path can ever see a signed-in user with no profile row, and there is no first-login race. The trigger function MUST be declared `SECURITY DEFINER` (it runs as the function owner, which bypasses RLS). This is load-bearing: there is deliberately no user INSERT policy on `profiles`, so a trigger running as the invoking role would fail RLS silently on every first sign-up. `SECURITY DEFINER` is what lets the insert succeed while users still cannot insert profiles directly.
- `updated_at` maintenance: a database trigger (moddatetime style) on every table that has the column. Runner-up: app-managed timestamps. A trigger means the timestamp is right no matter which code path wrote the row, including a service path or a manual fix. It is one invariant that cannot be forgotten.
- Index plan: minimal and justified, listed in Feature design below.

## Rationale

Why one ratings table with a source tag: the three inputs (Letterboxd, IMDb, onboarding) differ only in where the value came from and on what scale. Once normalized to 0 to 100 they are the same fact. Splitting them into three tables would force the taste engine to union three shapes for no gain, and would spread the "one rating per user per movie" invariant across tables where the database can no longer enforce it. One table with a `source` column keeps the invariant enforceable and the read simple. Storing `raw_value` and `raw_scale` next to `normalized_value` keeps the original signal, so if we improve the normalization later we can recompute from the source of truth rather than from a lossy number.

Why defer the vectors: covered above. It is non-breaking to add later and locking the dimension now is guessing. This is also the general rule of not storing a derived value without a measured need. The vector is derived from ratings, and it is expensive and model-dependent, so it waits. `genre_affinities` is the one derived value we allow early, and only as an optional cache: it can go stale, it is recomputed, and nothing depends on it being present or fresh.

Why minimal movies now: catalog mechanics (TMDB sync, freshness, validation) are a feature of their own. This ADR gives the other tables a real key to point at (the TMDB id) and the few display fields the app needs, and stops there. Feature 4 adds the sync and validation columns on top without touching anything here.

Why an imports table: ADR 0001 requires that a CSV import can retry, resume, and stay idempotent. That needs a durable record of each job (its status and row counts) and a link from each produced rating back to its import. The `imports` row plus `ratings.import_id` plus the unique `(user_id, movie_id)` upsert are exactly that: a half-finished import can be resumed, and re-running it updates rows instead of duplicating them.

The enum, primary key, and trigger picks are argued in the Decision above. The through-line is the same one every time: enforce invariants in the database, keep the shape easy to evolve, and do not commit to anything (a dimension, a surrogate key) before there is a reason to.

## Feature design

### Data model sketch

Conventions: `created_at` and `updated_at` are `timestamptz not null default now()` where present. All `uuid` primary keys default to `gen_random_uuid()`. "RLS" describes which rows a signed-in user may touch.

**profiles** (app-level user, 1:1 with `auth.users`)

| column | type | null | notes |
| --- | --- | --- | --- |
| id | uuid | no | PK, FK to `auth.users(id)` on delete cascade |
| display_name | text | yes | |
| avatar_url | text | yes | |
| onboarding_completed | boolean | no | default false |
| created_at | timestamptz | no | default now() |
| updated_at | timestamptz | no | default now(), trigger-maintained |

RLS: a user may read and update only the row where `id = auth.uid()`. Insert is handled by the auto-creation trigger. No delete by users (delete flows from `auth.users` cascade).

**movies** (shared read-only TMDB cache, minimal; feature 4 extends)

| column | type | null | notes |
| --- | --- | --- | --- |
| id | bigint | no | PK, the TMDB id (natural key) |
| title | text | no | |
| release_year | int | yes | |
| overview | text | yes | |
| poster_path | text | yes | |
| genres | jsonb | yes | genre list |
| runtime_minutes | int | yes | |
| created_at | timestamptz | no | default now() |
| updated_at | timestamptz | no | default now(), trigger-maintained |

RLS: readable by every authenticated user. No insert, update, or delete policy for users, so writes are service/system only (a path using a privileged client, per ADR 0001).
Added by feature 7: `embedding vector(N)` (nullable). Added by feature 4: sync, freshness, and validation columns.

**ratings** (all taste signal: imports and onboarding folded in)

| column | type | null | notes |
| --- | --- | --- | --- |
| id | uuid | no | PK |
| user_id | uuid | no | FK `profiles(id)` on delete cascade |
| movie_id | bigint | no | FK `movies(id)` |
| source | text | no | CHECK in ('letterboxd','imdb','onboarding') |
| raw_value | numeric | yes | original value from the source |
| raw_scale | text | yes | e.g. '0.5-5', '1-10', 'like/dislike' |
| normalized_value | integer | no | CHECK between 0 and 100 |
| rated_at | timestamptz | yes | when the user rated it, from the CSV |
| import_id | uuid | yes | FK `imports(id)`, which import produced it |
| created_at | timestamptz | no | default now() |

Constraints: UNIQUE `(user_id, movie_id)`; a re-import UPSERTS on that key (latest wins).
RLS: a user may read, insert, update, and delete only rows where `user_id = auth.uid()`.

**taste_profiles** (one per user, 1:1)

| column | type | null | notes |
| --- | --- | --- | --- |
| user_id | uuid | no | PK, FK `profiles(id)` on delete cascade |
| genre_affinities | jsonb | yes | optional early non-vector signal, a cache |
| rating_count | integer | no | default 0 |
| computed_at | timestamptz | yes | when the profile was last computed |
| created_at | timestamptz | no | default now() |
| updated_at | timestamptz | no | default now(), trigger-maintained |

RLS: a user may read and write only the row where `user_id = auth.uid()`.
Added by feature 7: `vector vector(N)` (nullable).

**watchlist_items** (saved movies)

| column | type | null | notes |
| --- | --- | --- | --- |
| id | uuid | no | PK |
| user_id | uuid | no | FK `profiles(id)` on delete cascade |
| movie_id | bigint | no | FK `movies(id)` |
| added_at | timestamptz | no | default now() |

Constraints: UNIQUE `(user_id, movie_id)`.
RLS: a user may read and write only rows where `user_id = auth.uid()`.

**searches** (vibe-search log plus results)

| column | type | null | notes |
| --- | --- | --- | --- |
| id | uuid | no | PK |
| user_id | uuid | no | FK `profiles(id)` on delete cascade |
| query_text | text | no | |
| parsed_intent | jsonb | yes | structured intent from Claude |
| results | jsonb | yes | array of {movie_id, reason} |
| created_at | timestamptz | no | default now() |

RLS: a user may read and write only rows where `user_id = auth.uid()`. Results are stored as JSON, not foreign keys (see the tradeoff in Context).

**imports** (CSV import jobs: retry, resume, idempotency)

| column | type | null | notes |
| --- | --- | --- | --- |
| id | uuid | no | PK |
| user_id | uuid | no | FK `profiles(id)` on delete cascade |
| source | text | no | CHECK in ('letterboxd','imdb') |
| status | text | no | CHECK in ('pending','processing','completed','failed'), default 'pending' |
| total_rows | int | yes | |
| matched_rows | int | yes | |
| unmatched_rows | int | yes | count of rows that failed matching |
| unmatched | jsonb | yes | the raw rows that failed matching (array of {title, year, raw_value, raw_scale, reason}), retained so they can be surfaced and reconciled |
| error | text | yes | |
| created_at | timestamptz | no | default now() |
| updated_at | timestamptz | no | default now(), trigger-maintained |

RLS: a user may read and write only rows where `user_id = auth.uid()`.
Why the `unmatched` column: `ratings.movie_id` is NOT NULL, so a CSV row that cannot be matched to a real `movies` record (a TMDB miss, a typo, a renamed title) has no home in `ratings`. Storing the raw failed rows here (not just a count) means the import feature can surface them for review and let the user reconcile them later, rather than silently dropping them. Kept as jsonb (consistent with `searches.results`) because the MVP only needs to display and re-attempt them; if per-row reconciliation grows into a real feature, this normalizes into its own table without touching existing columns.

Relationships: `auth.users` 1:1 `profiles`; `profiles` 1:N `ratings` / `watchlist_items` / `searches` / `imports` and 1:1 `taste_profiles`; `movies` 1:N `ratings` / `watchlist_items`; `imports` 1:N `ratings` (nullable). Deleting a user cascades to every owned row. No soft deletes anywhere.

### State transitions

imports.status moves in one direction and settles at a terminal state:

```
pending ──▶ processing ──▶ completed
                  │
                  └────────▶ failed
```

A row starts `pending`, moves to `processing` while rows are being read and matched, and ends at `completed` or `failed`. A `failed` or interrupted job can be picked up again: because ratings upsert on `(user_id, movie_id)`, re-processing the same import re-applies rows without duplicating them.

### API surface

None at the data layer. This feature ships no endpoints. The interface it exposes is the schema plus the RLS policies. Later features consume it through the Supabase SDK, using a user-scoped client so RLS applies (per ADR 0001).

### Key invariants

- UNIQUE `(user_id, movie_id)` on both `ratings` and `watchlist_items`: one rating and one watchlist entry per user per movie.
- `ratings.normalized_value` is between 0 and 100 (CHECK).
- Every user-owned row's `user_id` equals the owner; RLS makes any other row invisible and unwritable.
- Deleting a user leaves no orphans: every FK from a user-owned table to `profiles`, and `profiles` to `auth.users`, is `on delete cascade`.
- `movies` is not user-writable; only a service or system path may write it.
- A `profiles` row exists for every `auth.users` row (guaranteed by the insert trigger).

### Security model

RLS is enabled on every user-owned table (profiles, ratings, taste_profiles, watchlist_items, searches, imports), with policies scoping each operation to `auth.uid()`. `movies` has RLS enabled with a single read-all policy for authenticated users and no user write policy, so only a privileged (service) path writes it. This is per-user data isolation, not a regulated-data compliance scope: the data is a user's own movie ratings and their account email, nothing more sensitive.

Load-bearing rule from ADR 0001: RLS only protects data when server code uses a user-scoped Supabase client. A path that uses the service-role key bypasses RLS entirely and must never touch a user data path. This ADR enables RLS in the database; that app-side rule lives in AGENTS.md and is not re-decided here.

### Configuration required

None new. The Supabase URL and keys already in `.env.example` from ADR 0001 are all this feature needs. Env vars are validated at startup per the existing convention.

### Critical test scenarios

- Happy path (AC-1, AC-2): create an auth user, confirm the `profiles` row was auto-created, insert a rating as that user, read it back through a user-scoped client. The row is there and belongs to that user.
- Isolation / failure (AC-2): as user B, attempt to read and to update user A's ratings, watchlist, and searches under RLS. Every attempt returns nothing or is rejected.
- Cascade (AC-4): delete the `auth.users` row, then query every owned table for that user_id. No rows remain anywhere.
- Upsert (AC-3): import the same movie twice with different values. The result is one ratings row carrying the latest value, not two rows.
- Deferred vector (AC-7): run a follow-on migration that adds a nullable `vector` column to `movies` and `taste_profiles`. It applies cleanly with no change to existing columns, keys, or policies.

## Build plan

The tracer-bullet slice for a data-layer foundation is the schema plus RLS, applied and confirmed live in the database (not just written as a migration file). The migration is task 1 and stays early.

1. Write the migration defining all seven tables with fields, types, nullability, foreign keys, unique constraints, CHECK constraints, and the `source` / `status` allowed value sets (text + CHECK). Satisfies AC-1, AC-3, AC-5, AC-7.
2. Add `on delete cascade` on every user-owned foreign key, and on `profiles.id` to `auth.users(id)`. Satisfies AC-4.
3. Enable RLS and write per-operation policies on all user-owned tables, plus the read-all policy on `movies` and no user write policy. For each user-owned table the policies key on `auth.uid()`: SELECT and DELETE use a `USING (user_id = auth.uid())` clause, INSERT uses `WITH CHECK (user_id = auth.uid())`, and UPDATE uses both `USING` and `WITH CHECK`. The ratings upsert needs both the INSERT (`WITH CHECK`) and UPDATE (`USING` + `WITH CHECK`) policies present, or the upsert half-fails. `profiles` gets SELECT and UPDATE policies for the owner but deliberately no user INSERT policy (insert is the trigger's job, see task 4). Satisfies AC-2.
4. Add the `handle_new_user` trigger on `auth.users` insert to create the `profiles` row, declared `SECURITY DEFINER` so the insert runs as the function owner and is not blocked by the missing user INSERT policy on `profiles`. Add moddatetime-style `updated_at` triggers on every table that has the column. Supports AC-1.
5. Add the indexes: the two unique constraints (ratings and watchlist_items) index themselves; add indexes on the foreign-key columns that are queried on their own (`ratings.user_id`, `ratings.movie_id`, `ratings.import_id`, `watchlist_items.user_id`, `searches.user_id`, `imports.user_id`, `taste_profiles.user_id` is the PK already), and a read-path composite index `searches(user_id, created_at desc)` for the search history view. Keep it to these; add more only when a real query needs one. Supports AC-2 and read performance.
6. Apply the migration to the database and confirm the schema is live: query the catalog so that tables, columns, constraints, triggers, and policies are actually present, not merely written in a file. Satisfies AC-1 through AC-6.

Note: the rating-scale normalization helper (mapping Letterboxd, IMDb, and onboarding values to 0 to 100) is application logic built with the import feature (feature 7). This ADR fixes only that `ratings` stores a normalized 0 to 100 value.

## Consequences

**Positive**

- Every core invariant is enforced by the database, so no application bug or stray code path can insert a duplicate rating, an out-of-range value, or an orphaned row.
- RLS in the database means per-user isolation does not depend on remembering a `where user_id = ...` in every query. The wrong rows are simply invisible.
- One ratings table gives the taste engine a single, uniform read regardless of where a rating came from.
- Deferring vectors keeps this migration small and lets feature 7 choose the model and dimension without a rewrite.
- Standard Supabase patterns (the auth trigger, moddatetime, RLS policies) mean a new engineer recognizes the shape immediately.

**Negative**

- Search results stored as jsonb are not queryable per result. Cross-search questions about individual movies need JSON unpacking or a later normalization.
- `genre_affinities` is a cached derived value and can go stale between recomputes. Anything reading it must treat it as a hint, not truth.
- The TMDB id as the movies primary key couples our primary key to an external system. If TMDB ids ever prove unstable, or feature 4 needs a different identity, changing the key touches every table that references it.
- Deferring the vector columns means feature 7 owns a follow-on migration and must not forget it; the taste engine cannot function until that migration lands.
- Text + CHECK for the enums trades a small amount of type-level self-documentation (a native enum shows its values in the type) for easier evolution. The allowed values live in a constraint, not a named type.

**Neutral**

- Seven tables is a few more than a flattened design, and a few less than a fully normalized one. It is the right granularity for this app, not a minimum or a maximum.
- Onboarding swipes are modeled as ratings with `source = onboarding` rather than their own table, so the onboarding UI writes to the same place imports do.

## Follow-up

- [ ] Embedding columns (`movies.embedding`, `taste_profiles.vector`) added by feature 7 once the model and dimension are chosen.
- [ ] Movie catalog sync, freshness, and validation columns added by feature 4.
- [ ] Rating-scale normalization helper (Letterboxd / IMDb / onboarding to 0 to 100) built with the import feature (feature 7).
- [ ] (optional) A Supabase conventions skill is not installed. Installing one would help the later implementation follow house patterns for migrations, RLS, and triggers.
