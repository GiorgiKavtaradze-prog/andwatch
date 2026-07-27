# Roadmap — Reel (movie recommendations)

A recommendation-first movie app for film lovers. Power users import their Letterboxd or IMDb rating history to get an instant taste profile, everyone else builds one through a quick onboarding, and the app returns personal picks (a ranked feed and a natural-language vibe search) with a one-line reason for every title. The matching algorithm is the star. Every movie shown is validated against a real database, so no title is ever made up.

**Build approach:** Tracer Bullet — each slice is built end to end and works; the first slice is a thin thread from sign-in to a real recommendation, and later slices thicken it.
**Weight profile:** most features are medium; the recommendation engine, CSV import, movie-catalog integration, and vibe search are full (high risk and the core value). Tooling is lean.

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Data model | Foundation | done |
| 4 | Movie catalog & validation | Foundation | done |
| 5 | Design system & UI foundation | Foundation | done |
| 6 | Accounts & auth | Slice 1 | done |
| 7 | CSV import & taste profile | Slice 1 | done |
| 8 | Recommendation feed with reasons | Slice 1 | in-progress |
| 9 | Onboarding (genres + swipe) | Slice 2 | in-progress |
| 10 | Natural-language vibe search | Slice 3 | in-progress |
| 11 | Movie detail page | Slice 4 | in-progress |
| 12 | Watchlist | Slice 4 | in-progress |
| 13 | Secondary recommendation rows | Slice 4 | in-progress |

## Foundations

### 1. Stack & architecture · done
Decide the stack for a login-walled responsive web app and scaffold a runnable project, so every later slice builds on real structure. Fold in the light standards preferences here (architecture style, formatting taste).
**Done when:** the stack is recorded in an ADR and the empty scaffold boots locally and passes build.
- [x] Decide the stack (ADR): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
- [x] Smoke-check it runs: build + lint + dev server all green
ADR [0001](../adr/0001-stack-and-architecture.md) · code in `./`

### 2. Coding standards & tooling · done · lean
Capture conventions from the real scaffolded project, then install the chosen lint/format tooling. Choices recorded: Biome for lint and format (replacing the scaffold's ESLint), no pre-commit hooks, typecheck plus manual `/verify` for testing (no runner yet), no CI yet.
**Done when:** root `AGENTS.md` reflects the real stack (done), and Biome is installed and runs clean (done).
- [x] Capture conventions + tooling choices: `/audit`
- [x] Install the tooling (Biome): `/develop tooling`
ADR none · code in `AGENTS.md`, `biome.json`, `package.json`

### 3. Data model · done
The core entities every feature builds on: users, cached movie records, imported external ratings, the taste profile, watchlist items, and saved searches/recommendation results.
**Done when:** the entities and relationships support CSV import, onboarding, feed, vibe search, and watchlist without a breaking migration.
- [x] Design it (ADR): `/architect data model`
- [x] Migration: all 7 tables (fields, types, FKs, unique + CHECK constraints, source/status sets) — satisfies AC-1, AC-3, AC-5, AC-7
- [x] Add ON DELETE CASCADE on user-owned FKs and profiles → auth.users — AC-4
- [x] Enable RLS + per-operation policies (user tables + movies read-all; ratings needs INSERT and UPDATE) — AC-2
- [x] Add handle_new_user trigger (SECURITY DEFINER) + updated_at triggers — AC-1
- [x] Add indexes (FK columns + searches(user_id, created_at desc)) — AC-2
- [x] Apply migration and confirm schema is live (tables, constraints, triggers, policies present) — AC-1 to AC-6
ADR [0002](../adr/0002-data-model/0002-data-model.md) · code in `supabase/migrations/`

### 4. Movie catalog & validation · done · full
The canonical source of real movies and their metadata (themes, pacing, cinematography, emotional arc, cast, year), plus the validation gate that guarantees no recommendation ever shows a made-up title. Every other feature reads from this. Import parsing and AI output both resolve against it.
**Done when:** any title surfaced by the app (feed, vibe search, import match) resolves to a real catalog record, unresolved titles are rejected or flagged, and metadata is available for matching.
- [x] Design it (ADR): `/architect movie catalog & validation`
- [x] Migration: ALTER movies +8 cols (imdb_id unique, directors, top_cast, keywords, vote_average, vote_count, popularity, synced_at) + indexes; applied and confirmed live — AC-1
- [x] Install @supabase/supabase-js; server service client (secret key) + TMDB client (details/search/find/lists) with token-bucket limiter + 429 backoff; validate env at startup — AC-2, AC-7
- [x] Cache-through resolver (resolveByTmdbId/ImdbId/TitleYear), upsert on id, fail-closed no-match, title+year match rule — AC-3, AC-4
- [x] Batch resolver resolveMany(refs) — shared rate budget, per-ref result, for chunked import — AC-9
- [x] Validation service: validateMovieIds (backstop) + getCandidates (DB-filter MVP) — AC-5
- [x] Seed script (npm run seed:movies via tsx), idempotent — AC-6
- [x] Document TMDB attribution UI obligation (src/lib/tmdb/attribution.ts) for movie-rendering features — AC-8
ADR [0003](../adr/0003-movie-catalog-validation/0003-movie-catalog-validation.md) · code in `src/lib/catalog`, `src/lib/tmdb`, `scripts/`

### 5. Design system & UI foundation · done
Visual language, layout primitives, and base components so the app feels distinctive and cohesive (this is a design-led product). Covers the recommendation card, the swipe control, and the vibe-search input as shared primitives.
**Done when:** `design.md` covers type/color/spacing/motion/components, and base components handle focus and keyboard.
- [x] Design it (ADR): `/architect design system & UI foundation`
- [x] Install Tailwind v4 + PostCSS, primitive stack (Radix, cva, clsx, tailwind-merge), sonner, lucide-react, motion; wire into globals.css; doc-checked current Tailwind v4 setup — AC-2
- [x] Write design.md (full token set + component conventions) — AC-1
- [x] Wire tokens as Tailwind @theme, load Fraunces + Inter via next/font, dark default, reduced-motion block, mount Sonner — AC-2, AC-6
- [x] Base primitives (button, input, label, card, badge, dialog, skeleton, toast, dropdown-menu, avatar), accessible — AC-3
- [x] Product shells (PosterImage, recommendation card, swipe card, vibe-search input, app shell + user-menu + mobile-nav), presentational — AC-4
- [x] Poster fallback + lucide icons + TMDB attribution in app-shell footer — AC-5
- [x] Motion (swipe/reveals + CSS transition tokens) gated on prefers-reduced-motion — AC-6
ADR [0004](../adr/0004-design-system-ui-foundation/0004-design-system-ui-foundation.md) · code in `design.md`, `src/components/`, `src/app/globals.css`

## Slice 1 — Core taste-to-feed thread

This slice is the walking skeleton: the thinnest end-to-end path that proves the whole stack and the core value. Sign in, turn one rating import into a taste profile, and see a real recommendation feed. Nothing else yet.

### 6. Accounts & auth · done
Sign in so a user's taste profile, imported data, and watchlist persist across devices. The gate for everything else.
**Done when:** a user can create an account, sign in and out, and their data is scoped to them.
- [x] Design it (ADR): `/architect accounts & auth`
- [x] Migration: update handle_new_user to copy display_name + avatar_url from Google metadata; applied — AC-2
- [x] Install @supabase/ssr; browser client + server client (setAll try/catch) + proxy (Next 16 renamed middleware → proxy.ts: updateSession, same-response cookie contract, protected-route redirect to /, verified 307) — AC-3, AC-6, AC-7
- [x] OAuth: Continue-with-Google client button + /auth/callback route (exchangeCodeForSession → /) — AC-1
- [x] Adaptive / (page.tsx): signed-out landing vs signed-in app home in AppShell, gated by getUser() — AC-1, AC-4
- [x] Sign out server action wired to AppShell UserMenu (name/avatar from getUser metadata) — AC-5
- [x] Verify end to end: real Google sign-in, profile populated, reload persists, sign out returns to landing — all ACs
ADR [0005](../adr/0005-accounts-auth/0005-accounts-auth.md) · code in `src/lib/supabase/`, `src/app/auth/`, `src/proxy.ts`, `src/app/page.tsx`

### 7. CSV import & taste profile · done · full
The star, first half: accept a Letterboxd or IMDb CSV export, parse and validate each rated title against the movie catalog, and turn the rating history into a taste profile the engine can match on (themes, pacing, cinematography, emotional arc, not genre tags). This ADR is the recommendation-engine umbrella that feature 8 builds on.
**Done when:** a user uploads a real export, rows resolve to catalog records (with unmatched rows surfaced, not silently dropped), and a taste profile is produced from it.
- [x] Design it (ADR): `/architect csv import & taste profile`
- [x] Migration: add `movies.embedding vector(1536)` + HNSW cosine index (m=16, ef_construction=64) and `taste_profiles.vector vector(1536)`, applied and confirmed live (index `idx_movies_embedding_hnsw` present) — AC-1
- [x] Embeddings client (`src/lib/embeddings`): install `openai`; `embedMovies` composes the per-movie doc (overview+keywords+genres+directors+top_cast), batches `text-embedding-3-small`, L2-normalizes, writes via the service client; add `OPENAI_API_KEY` to startup env validation — AC-5, AC-10
- [x] Embed on the import + seed + backfill paths (NOT the shared resolver, keeping cache-through off the OpenAI call): call `embedMovies` from the import chunk and seed; add `scripts/backfill-embeddings.ts` for pre-existing rows — AC-5
- [x] CSV parse + source auto-detect (client, Papa Parse): browser-parse, detect Letterboxd vs IMDb from headers (user can correct), map rows, skip IMDb TV/episode rows as skipped — AC-2
- [x] Chunked import server actions (`src/app/import`): `createImport`, `processImportChunk` (normalize → `resolveMany` → upsert `ratings` → embed new movies → append `imports.unmatched` → advance status/counts; 3-retry backoff, idempotent upsert, same-import-id resume), `getImportStatus` — AC-3, AC-4
- [x] Taste-vector computation (`src/lib/taste`): `computeTasteProfile` rating-weighted centroid + zero-variance fallback, floor `MIN_RATINGS_FOR_PROFILE=20`, writes vector + rating_count + computed_at + genre_affinities cache; below-floor result — AC-6, AC-7, AC-8
- [x] Import UI (`src/app/import`): drag/drop upload, auto-detect, live progress, matched/unmatched/skipped counts + unmatched list; idle/parsing/processing/done/below-floor/error states, built to design.md — AC-9
- [x] Wire end to end: create → parse → chunk loop → status → done/below-floor/error, link on to the feed; confirm the re-import merge path (verified via /verify: a real Letterboxd import produced a 1536-dim taste vector; unit-tested; hardened, see `docs/hardening/2026-07-05-csv-import-taste-profile.md`) — AC-2 through AC-9
ADR [0006](../adr/0006-csv-import-taste-profile/0006-csv-import-taste-profile.md) · code in `supabase/migrations/`, `src/lib/embeddings`, `src/lib/taste`, `src/app/import`, `scripts/`

### 8. Recommendation feed with reasons · needs a decision · full
The star, second half: given a taste profile, rank the catalog and present a personal feed of picks, each with a one-line reason explaining why it fits this person. Builds on the engine decision from feature 7.
**Done when:** a user with a taste profile sees a ranked feed of real, unseen movies, each pick carries a personal one-line reason, and empty/loading/error states render.
- [x] Design it (ADR): `/architect recommendation feed with reasons`
- [ ] Migration: `recommendations` table (id, user_id FK cascade, movie_id FK, rank, score, reason, generated_at) + UNIQUE(user_id, movie_id) + index (user_id, rank) + owner-only per-operation RLS; applied and confirmed live — AC-1 ⚠ migration written (`supabase/migrations/20260705130000_add_recommendations.sql`); apply is an operator step (no in-repo apply; use the Supabase SQL editor or link the CLI and `npx supabase db push`)
- [x] Retrieval RPC + wrapper (`src/lib/feed`): `match_feed_candidates(taste_vector, pool_size)` SECURITY INVOKER (cosine `<=>`, non-null embedding, anti-join on `ratings`, `set local hnsw.ef_search=40`, pool 30) + `matchFeedCandidates` wrapper (read taste vector, `toVectorLiteral`, popularity near-tie break, top 10) — AC-3
- [x] Anthropic client + batched Sonnet reason writer + env (`src/lib/feed`): install `@anthropic-ai/sdk`; add `anthropicApiKey` to `serverEnv`; `writeReasons` (per-movie metadata + user taste summary → one `claude-sonnet-5` structured-JSON call → `movie_id→reason` map with grounded fallback line) — AC-4, AC-9
- [x] Generate + cache + staleness + atomic replace (`src/lib/feed`): `generateFeed` (candidates → reasons → `replace_recommendations` transactional RPC SECURITY INVOKER, only after full set built), staleness helper (`computed_at` vs max `generated_at`) — AC-5, AC-6
- [x] `getFeed` / `refreshFeed` server actions (`src/app/feed`): `getFeed` (getUser gate; no-profile/empty/ready+stale; no Claude call), `refreshFeed` (force regen; auto-fires once per mount, manual retry on failure, no loop) — AC-5, AC-6, AC-9
- [x] Feed page + grid + refresh + states (`src/app/feed`): grid of `recommendation-card`, header + manual refresh, loading/populated/no-profile/thin/error states; client leaf drives refresh keeping a stale feed dimmed — AC-7, AC-8
- [ ] Wire end to end: link the feed from home/nav (done); confirm import → taste vector → feed with reasons; cached serve makes no Claude call; refresh + profile-change regen work — AC-2 through AC-9 ⚠ runtime confirm pending `/verify` (needs the migration applied + `ANTHROPIC_API_KEY` set)
ADR [0007](../adr/0007-recommendation-feed-reasons/0007-recommendation-feed-reasons.md) · code in `supabase/migrations/`, `src/lib/feed`, `src/app/feed`

## Slice 2 — Onboarding profile path

### 9. Onboarding (genres + swipe) · needs a decision
The no-CSV path to a starting taste profile: pick a few genres, swipe roughly 15 movies to like/dislike, and generate an initial profile that feeds the same feed built in Slice 1. (Streaming-service selection is deferred, so it is not part of onboarding.)
**Done when:** a user without an import completes genre pick and enough swipes (≥20, the taste-profile floor from ADR 0006) and lands on a populated recommendation feed.
- [x] Design it (ADR): `/architect onboarding (genres + swipe)`
- [x] Onboarding lib (`src/lib/onboarding`): TMDB genre-name constants + `buildOnboardingDeck(genres, excludeIds, size)` (service-client query: embedded `embedding is not null`, `synced_at` present, popular, genre-matched with broaden-when-thin, excludes ids in memory) — AC-1
- [x] Server actions (`src/app/onboarding`): `getOnboardingDeck` (getUser gate; excludes user's rated ids; `ok`/`thin`) + `completeOnboarding` (getUser gate; upsert onboarding ratings 100/0 via user-scoped client; `computeTasteProfile`; set `onboarding_completed`; returns `FinalizeResult`). Note: has-profile redirect handled at the page, not the action. — AC-2, AC-4, AC-5, AC-6
- [x] Onboarding page + client flow (`src/app/onboarding`): login-walled (redirects to `/feed` if a profile exists); genre-pick (1..5 chips) → swipe deck (`SwipeCard`, like/dislike/skip) with live progress + finish-at-floor gate; finishing/thin-catalog states; built to `design.md` — AC-3, AC-7, AC-8
- [ ] Wire end to end: feed's no-profile state already links `/onboarding`; confirm genre pick → ≥20 swipes → taste vector → populated feed, plus thin-catalog and already-onboarded redirect — AC-1 through AC-8 ⚠ runtime confirm pending `/verify` (needs the DB live with an embedded catalog)
ADR [0008](../adr/0008-onboarding-genres-swipe.md) · code in `src/lib/onboarding`, `src/app/onboarding` (no migration — reuses `ratings`/`taste_profiles`)

## Slice 3 — Natural-language vibe search

### 10. Natural-language vibe search · needs a decision · full
The second hero: a user describes a vibe in plain words (mood, themes, time available, who's watching), the AI parses it, matches it against catalog metadata, and returns 3 to 5 real picks each with a one-line reason, personalized by the user's taste profile. Extends the engine and validation decisions.
**Done when:** a free-text query returns 3 to 5 validated real titles with per-pick reasons, weighted by the user's profile, and every returned title exists in the catalog.
- [x] Design it (ADR): `/architect natural-language vibe search`
- [ ] Migration: `match_vibe_candidates(query_vector, taste_vector, pool_size, min_year, max_year, max_runtime)` SECURITY INVOKER (cosine on query vector via `operator(public.<=>)`, returns query + taste distance, year/runtime SQL filters); applied and confirmed live — AC-2, AC-3 ⚠ migration written (`supabase/migrations/20260705140000_add_vibe_search.sql`); apply is an operator step (Supabase SQL editor or `npx supabase db push`)
- [x] Parse + embed (`src/lib/search`): `parseVibe` (Haiku `claude-haiku-4-5` structured JSON → `VibeIntent`) + embed `vibeText` via `embedTexts` — AC-1
- [x] Retrieval + blend wrapper (`src/lib/search`): `matchVibeCandidates` (call RPC; blend `0.7*query + 0.3*taste` similarity, taste 0 when null; shortlist top 15) — AC-2, AC-3
- [x] Select + reason (`src/lib/search`): `writeVibePicks` (Sonnet `claude-sonnet-5` structured JSON, 3..5 `{movie_id, reason}` constrained to shortlist ids, grounded in vibe + metadata) + `validateMovieIds` backstop — AC-4, AC-5
- [x] `searchVibe` server action + orchestration (`src/app/search`): getUser gate; read taste vector; parse → embed → match → select → validate; log to `searches`; `ok`/`empty`/`error` — AC-1 through AC-7
- [x] Search page + input + states (`src/app/search`): `VibeSearchInput` + `recommendation-card` grid; loading/results/no-results/error, built to `design.md`; nav already links `/search` — AC-8
- [ ] Wire end to end: link search from nav/home (nav done); confirm query → validated personalized picks with reasons, facet filter, no-profile path, no-results — AC-1 through AC-8 ⚠ runtime confirm pending `/verify` (needs migration applied + `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` + embedded catalog)
ADR [0009](../adr/0009-natural-language-vibe-search.md) · code in `supabase/migrations/`, `src/lib/search`, `src/app/search`

## Slice 4 — Browse & watchlist

### 11. Movie detail page · medium
A page per movie: metadata, poster/imagery, why it was recommended (reusing the pick's reason), and add-to-watchlist. Leans on the catalog, data model, and design system, so no new decision.
**Done when:** every recommendation links to a detail page that renders real metadata and offers add-to-watchlist.
- [x] Build it: `/develop movie detail page` — `/movie/[id]` renders poster, title, year/runtime/rating, genres, overview, director(s), cast + `WatchlistButton`; feed & vibe-search cards link to it via `href`. No migration (reuses `movies`/`watchlist_items`). Code in `src/app/movie/[id]`, `src/components/watchlist-button.tsx`. ⚠ runtime confirm pending `/verify` (needs DB live).

### 12. Watchlist · medium
Save picks from the feed, vibe search, or a detail page, then view and manage the list. Standard CRUD on the entity already in the data model, rendered with the design system, so no new decision.
**Done when:** a user can add and remove titles from anywhere they appear and see their watchlist, scoped to their account.
- [x] Build it: `/develop watchlist` — `src/app/watchlist/actions.ts` (`setWatchlist` add/remove, `getWatchlist`) centralizes the watchlist logic (moved out of feed actions); `/watchlist` page + `WatchlistView` (grid with in-place remove + empty state). Add/remove wired from feed, vibe search, and the detail page. No migration (reuses `watchlist_items`). ⚠ runtime confirm pending `/verify`.

### 13. Secondary recommendation rows · needs a decision
Extra recommendation surfaces beyond the main feed: "top next to watch," "essentials you have missed based on your history," and other themed rows. New algorithmic surfaces that extend the engine.
**Done when:** the home experience shows at least two themed rows of real, personalized picks with reasons, distinct from the main feed.
- [x] Design it (ADR): `/architect secondary recommendation rows`
- [x] Rows lib (`src/lib/rows`): `getRowPool` (call `match_feed_candidates` for a large pool of nearest unseen candidates with score + popularity) + `buildRows` (slice into Hidden gems / Crowd-pleasers / More-<top-genre>, greedy cross-row dedupe, label with `groundedReason` + per-row lead-in) — AC-2, AC-3, AC-4
- [x] Home rows data (`getHomeRows`): reads taste vector + `genre_affinities`; `no-profile` when no vector; else pool → `buildRows` → mark watchlist state (called from the signed-in home, itself getUser-gated) — AC-1, AC-5, AC-6
- [x] Home rendering (`src/app/home-rows.tsx` + `src/app/page.tsx`): horizontally scrollable strips of `recommendation-card` (href to detail, watchlist toggle) distinct from the feed grid; profile/no-profile home copy + CTAs, built to `design.md` — AC-1, AC-5, AC-7
- [ ] Wire end to end: rows render on the signed-in home alongside feed/vibe-search/onboarding CTAs; confirm 2+ distinct deduped rows with grounded reasons, no-profile prompt, thin-pool behavior — AC-1 through AC-7 ⚠ runtime confirm pending `/verify` (needs feature 8 migration applied + DB live with an embedded catalog)
ADR [0010](../adr/0010-secondary-recommendation-rows.md) · code in `src/lib/rows`, `src/app/page.tsx` (no migration — reuses feature 8's `match_feed_candidates`)

## Deferred

Out of scope for this build pass, kept so the plan stays honest.
- **Rate/react to picks with a learning profile** — taste profile that updates over time from in-app ratings · needs a decision · full (explicitly excluded from the MVP; the MVP profile comes only from CSV import or onboarding)
- **Streaming availability / where to watch** — filter or badge picks by the user's services, needs a live availability source · needs a decision · full
- **Product analytics** — measure signups, imports, searches, watchlist adds · needs a decision
- **Error monitoring** — capture production errors · needs a decision
- **Public shareable pages + SEO** — indexable movie or shared-list pages for discovery · needs a decision
- **Cookie/privacy consent + legal** — privacy, terms, consent · needs a decision

## Legend
- **Next step** = the first unticked box in a feature.
- **needs a decision** = run `/architect` first (it writes the ADR and fills that feature's build tasks); otherwise the feature goes straight to `/develop` (or `/audit` for standards & tooling).
- **Status** (in the table and beside the heading): `planned` → `in-progress` → `done`. Plus `existing` (built before this workflow) and `dropped` (de-scoped, kept for history).
- **Weight tag** `· full` = design review + `/harden` required; `lean`/`medium` are the norm.
- **Pointer line** (`ADR <n> · code in <path>`) sits directly under a feature, added by `/develop` once the ADR and code exist.
