<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reel

Reel is a recommendation-first movie web app. Users import their Letterboxd or IMDb rating history (CSV) to get an instant taste profile, or build one through onboarding, and get personal picks (a ranked feed and a natural-language vibe search) each with a one-line reason. Every title is validated against a real movie database, so nothing is invented. The app is fully login-walled. The matching engine (taste vectors matched against movie metadata) is the core.

## Stack

- **Language:** TypeScript (strict).
- **Framework:** Next.js 16 (App Router, Turbopack), React 19. One full-stack app: UI plus server code (server actions and route handlers) in one project.
- **Database:** Supabase (managed Postgres) with the `pgvector` extension for embedding similarity search, in the same database as the relational data.
- **Auth:** Supabase Auth with row-level security (RLS), which enforces per-user data ownership in the database.
- **Data access:** the Supabase SDK, with RLS policies scoping every user's data.
- **Styling & UI:** Tailwind CSS v4 (CSS-first `@theme` tokens) with shadcn-style copy-in components on Radix (we own the code), lucide icons, `motion` for animation, and Fraunces + Inter via `next/font`. Dark-first. `design.md` (repo root) is the single source of truth for tokens and component conventions.
- **AI model:** Anthropic Claude (parses vibe queries, writes the one-line reason per pick).
- **Movie data:** TMDB (The Movie Database) is the catalog source of truth.
- **Hosting:** Vercel hosts the app; Supabase provides data and auth.

The full reasoning is in the stack ADR: [docs/adr/0001-stack-and-architecture.md](docs/adr/0001-stack-and-architecture.md).

## Commands

- `npm run dev` — start the dev server (Turbopack).
- `npm run build` — production build (also runs the TypeScript check).
- `npm run start` — run the production build locally.
- `npm run lint` — lint with Biome.
- `npm run format` — format with Biome.
- `npm run check` — Biome check (lint + format) with fixes applied.
- `npm run seed:movies` — populate the movie catalog from TMDB (reads `.env.local`; tune size with `SEED_PAGES`).
- `npm run backfill:embeddings` — embed catalog movies that have no vector yet (reads `.env.local`; run after seeding). (ADR 0006)
- `npm test` — run the unit tests once (Vitest). `npm run test:watch` for watch mode.

Verify a change with `npm test` (Vitest) and `npm run build` (typecheck), plus the feature's `/verify` steps.

## Build approach

**Tracer Bullet.** Each slice is built end to end and works. The first slice is a thin thread from sign-in to a real recommendation; later slices thicken it (onboarding, vibe search, watchlist, more picks). Build a feature through every layer it spans, not a layer at a time. See the roadmap header: [docs/roadmap/roadmap.md](docs/roadmap/roadmap.md).

## Rules

- **Functional and immutable style.** Prefer pure functions and immutable data. Push side effects (I/O, network, state) to the edges. Compose functions rather than reaching for classes.
- **TypeScript strict.** No implicit `any`. Model the data (ratings, taste vectors, catalog metadata) with real types.
- **Project structure (Next.js default).** Routes and layouts in `src/app`. Shared, reusable code in `src/lib`. Shared UI in `src/components`. No per-feature top-level folders. Keep route-specific pieces near their route.
- **Consistent error handling.** Use one agreed error pattern across the app (do not invent a new one per file). Fail closed at boundaries; return error shapes the caller can rely on.
- **Validate environment variables at startup.** Parse and check the required env vars (Supabase, Anthropic, TMDB, OpenAI) on boot so the app fails loudly, not silently, when config is missing. `OPENAI_API_KEY` (embeddings) is server-only. See [.env.example](.env.example) and `src/lib/env.ts`.
- **RLS is only real with a user-scoped client.** On any path that reads or writes a user's own data, use a Supabase client that carries the signed-in user's token, so row-level security actually runs. Never use the service-role key on a user data path (it bypasses RLS). Reach for the service-role client only in explicit admin or system paths. (From ADR 0001.)
- **Auth and Supabase clients.** Google-only sign-in via Supabase Auth, cookie sessions via `@supabase/ssr`. Three clients: `service.ts` (secret key, system paths only) and `client.ts`/`server.ts` (user-scoped, RLS applies). Gate with `getUser()`, never `getSession()`. Route protection lives in `src/proxy.ts` (Next 16 renamed middleware to `proxy.ts`), but the matcher is a fast-path, not the security boundary, so every authed surface also does its own `getUser()` check. See [src/lib/supabase/AGENTS.md](src/lib/supabase/AGENTS.md). (From ADR 0005.)
- **Install dependencies just in time.** Each feature installs its own SDKs when it is built (Supabase client with auth/data, Anthropic SDK with the AI features, the embeddings client with the engine, TMDB with the catalog). Do not install everything up front.
- **TMDB attribution is required.** When TMDB data is shown, the UI must carry the required TMDB attribution (notice, logo, link back) before any public exposure. (From ADR 0001.) The attribution constants live in `src/lib/tmdb/attribution.ts` and render in the app-shell footer.
- **UI: build to `design.md`.** All UI uses the design tokens (Tailwind utility classes or `var(--token)`); never hardcode a hex or a raw px that duplicates a token. Base primitives live in `src/components/ui`, product components in `src/components`. Mark components that use callbacks, Radix, or `motion` with `"use client"`; keep pages and the app shell server-rendered with small client leaves. See [src/components/AGENTS.md](src/components/AGENTS.md).

## Tooling

- **Lint and format: Biome** (installed). `biome.json` at the root; ESLint removed. Biome cannot parse Tailwind v4 CSS directives, so `src/app/globals.css` is excluded from Biome (Tailwind owns that file). `next.config.ts` allows TMDB image hosts (`image.tmdb.org`, `www.themoviedb.org`) for `next/image`.
- **Pre-commit hooks: none.** No commit-time gate for now; rely on the build/typecheck and `/verify`.
- **Testing: Vitest (unit) plus typecheck and `/verify`.** Vitest is installed (jsdom environment, co-located `*.test.ts`; config in `vitest.config.ts`, env stubs in `vitest.setup.ts`, preferences in `test-preferences.json`); run `npm test`. The suite covers pure logic (the CSV parser, embedding helpers, the taste-vector math, the import chunk dedupe), mocking the DB, TMDB, and OpenAI at the boundary. `npm run build` (TypeScript) and the per-feature `/verify` steps remain the runtime gate. No CI yet.
- **CI: not set up yet.** No push/PR check for now.

## Context files

- [design.md](design.md) — the design system (tokens + component conventions), the source of truth for all UI.
- [src/components/AGENTS.md](src/components/AGENTS.md) — UI component conventions.
- [src/lib/supabase/AGENTS.md](src/lib/supabase/AGENTS.md) — the three Supabase clients and the auth rules.
- [src/lib/embeddings/AGENTS.md](src/lib/embeddings/AGENTS.md) — how embeddings and taste vectors are produced and stored in pgvector (the vector conventions the feed and vibe search read).
- [src/lib/feed/AGENTS.md](src/lib/feed/AGENTS.md) — the recommendation engine (feed, secondary rows, vibe search): the retrieval RPCs, the Haiku/Sonnet tier split, the `operator(public.<=>)` rule, and the client-safety import rule.
- [docs/roadmap/roadmap.md](docs/roadmap/roadmap.md) — the feature roadmap (owned by `/roadmap`).
- [docs/adr/](docs/adr/) — architecture decision records (owned by `/architect`).

## Skills

- Use the `frontend-design` skill when building UI components or pages (distinctive, production-grade frontend UI).
