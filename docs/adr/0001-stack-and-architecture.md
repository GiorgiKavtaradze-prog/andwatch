# 0001. Stack and architecture for Reel

**Status**: Accepted

## Summary

Reel is a login-walled movie recommendation app. We build it as one full-stack Next.js app (App Router) written in TypeScript, deployed on Vercel, with Supabase (managed Postgres) holding users, movies, ratings, taste profiles, and watchlists. The pgvector extension keeps the taste and movie vectors in that same database so matching is one SQL query, Supabase Auth with row-level security enforces per-user isolation, and Anthropic Claude parses vibe queries and writes the one-line reason per pick. This is a decision record for the stack only. The recommendation engine, the movie catalog mechanics, and the embeddings model are owned by later ADRs.

## Context

> ⚠️ Premise note: I checked the confirmed stack against the product and it holds. Nothing here is over-built for a login-walled MVP run by a small team. pgvector in the same Postgres is the right call at this scale (well under the ~10M vector range where a dedicated vector database starts to earn its keep), Next.js as a single full-stack app is the simple default, and Claude is a sound fit for structured parsing plus short natural-language reasons. There is one honest tradeoff to name, not to fix: choosing Supabase couples us to a backend-as-a-service platform (Supabase owns our database, auth, and the pooler). I record that coupling in Consequences rather than pretending it away. Two real downstream prerequisites are deliberately not decided here and are carried as Follow-ups: the embeddings model (owned by the recommendation-engine ADR, feature 7) and the TMDB catalog and validation mechanics (owned by the catalog ADR, feature 4).

Reel is a recommendation-first movie app. Power users import their Letterboxd or IMDb rating history as a CSV to get an instant taste profile. Everyone else builds one through onboarding. The app returns personal picks (a ranked feed and a natural-language vibe search), each with a one-line reason, and every title is validated against a real movie database so nothing is invented. The matching algorithm (taste vectors matched against movie metadata) is the core of the product.

What the stack has to serve:

- A small team that has to ship fast and keep the moving parts few. Every extra service is another thing to learn, wire, secure, and operate.
- A fully login-walled app where each user's imported ratings, taste profile, and watchlist are private. Per-user data isolation is a hard requirement, not a nice-to-have.
- An AI-heavy path. Vibe queries get parsed into structured intent, and each recommended pick needs a short written reason. That means a model provider in the request path, with cost and latency that have to stay sane.
- Vector matching at the heart of it. Taste vectors and movie metadata vectors need to be compared, ranked, and filtered together with normal relational data (a user's already-seen titles, their watchlist, catalog rows).
- A validation gate. No recommendation, whether it came from the AI or from a CSV row, may show a title that is not a real catalog record.
- A teachable, mainstream shape. The build is education oriented, so favor well-documented, widely used tools over clever or niche ones.

Explicitly out of scope for the MVP: external error tracking (Sentry), product analytics, cookie and consent flows, background job infrastructure, and file storage. Observability stays lean.

## Decision

Build Reel as a single full-stack TypeScript app on Next.js (App Router), hosted on Vercel, backed by Supabase (managed Postgres with pgvector, Supabase Auth, and row-level security), with Anthropic Claude as the AI provider and TMDB as the movie data direction. AI and database work runs on the Node.js serverless runtime, and CSV import is parsed synchronously within the request for the MVP.

## Options considered

### Option 1 (chosen): Next.js full-stack + Supabase + Vercel + Claude

One deployable Next.js app runs the UI and the server code (server actions plus route handlers). Supabase provides Postgres, pgvector, auth, and row-level security in one platform. Vercel hosts the app. Claude does parsing and reason writing.

- Pro: fewest moving parts for a small team. One app, one database platform, one host. Database, vectors, and auth collapse into a single platform, so there is no separate auth service to sync users into and no separate vector store to keep consistent with the relational rows.
- Pro: taste vectors and movie vectors live next to the relational data, so a match query can filter by "not already seen" and join catalog rows in one round trip.
- Pro: mainstream and teachable. All four pieces are heavily documented and widely used in 2026.
- Con: backend-as-a-service coupling. Supabase owns the database, auth, and pooler. Migrating auth off Supabase later is real work (see Consequences).
- Con: serverless execution time limits shape how long a single request may run, which constrains large synchronous CSV imports (addressed below and in Follow-up).

### Option 2: Next.js + Neon Postgres + a separate auth provider (Clerk) + Vercel + Claude

Same app and host, but split the data layer. Neon for Postgres (with pgvector), Clerk for auth.

- Pro: best-in-class auth UX from Clerk, and Neon's branching is pleasant for database development.
- Pro: less lock-in to any single backend platform, since auth and database are separate vendors you can swap independently.
- Con: more moving parts and a seam that has to be maintained. User identity lives in Clerk while user data lives in Neon, so you must sync Clerk user ids into Postgres and keep row-level security policies working against an external identity. That is exactly the integration cost a small team is trying to avoid, and it trades one vendor coupling for two.
- Con: two dashboards, two billing relationships, two failure domains for the core sign-in-to-recommendation thread.

### Option 3: React SPA + a separate Node API (Express or NestJS) + Postgres + Claude

A single-page React front end talking to a standalone Node API service, with its own Postgres and hand-rolled or library auth.

- Pro: clean separation of front end and back end, and full control over the server runtime (no serverless duration ceiling).
- Con: two deployables and two things to operate, plus you own the API server, its scaling, its session or token auth, and its deployment. This is more infrastructure than a login-walled MVP needs, and it invites building auth closer to scratch, which is a known way to ship security bugs.
- Con: loses the server-components and server-actions ergonomics that make the Next.js full-stack path fast to build and teach.

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript | The data model (ratings, taste vectors, catalog metadata) has enough shape that static types catch mistakes before runtime. |
| Framework | Next.js (App Router), full-stack | One React app that also runs server code via server actions and route handlers, so the whole sign-in-to-recommendation thread lives in one project. |
| Architecture pattern | Single layered monolith (one deployable) | Monolith first is the right default at this size, one thing to build, deploy, and reason about. |
| Primary DB | Supabase Postgres | A managed relational database is the correct default for users, ratings, catalog, and watchlists, and it is operated for us. |
| Vector search | pgvector (in the same Postgres) | Keeping vectors beside the relational rows lets one query match taste against metadata and filter by seen/watchlist, well within pgvector's comfortable range at this scale. |
| Auth | Supabase Auth + RLS | Never build auth from scratch, and row-level security enforces per-user data ownership in the database itself, not just in app code. |
| Data access | Supabase SDK with RLS | Reads and writes go through the Supabase client, with row-level security policies guaranteeing a user only ever sees their own rows. |
| AI model | Anthropic Claude | Strong structured-output following for parsing vibe queries, with a cheap fast tier (Haiku) for parsing and validation and a stronger tier (Sonnet or Opus) for the written reasons. |
| Embeddings | Deferred to the recommendation-engine ADR (vectors live in pgvector) | The stack decision is only that vectors live in pgvector; Anthropic has no first-party embeddings model, so the engine ADR picks a dedicated embeddings API. |
| Movie data source | TMDB (direction; catalog ADR finalizes) | Rich metadata plus ids that map to IMDb and Letterboxd exports, on a free tier; caching, freshness, and validation mechanics are owned by the catalog ADR. |
| Hosting | Vercel (app) + Supabase (data/auth) | Vercel is the first-party host for Next.js, and Supabase provides the managed data and auth platform. |
| Server runtime | Node.js serverless functions | The Supabase SDK, Postgres connections, and the Anthropic SDK all want a full Node runtime, and AI calls can run long, which the Edge runtime does not suit. |
| Observability | Minimal for MVP (structured logs + Next.js error boundaries + host logs) | Structured server logs plus Next.js error boundaries plus the built-in Vercel and Supabase logs are enough for the MVP; external tracking is deferred. |

Two RECOMMEND picks that shape the above:

1. Server runtime: Node.js serverless functions, not the Edge runtime. The Supabase client, raw Postgres connections, and the Anthropic SDK expect Node APIs, and the reason-writing calls to Claude can take several seconds, which is the wrong shape for Edge (small limits, partial Node API surface). Runner-up: the Edge runtime for lower latency at the network edge, rejected because it fights the exact libraries this app leans on. (basis: Supabase pooler guidance recommends transaction-mode pooling for serverless functions, and the Anthropic and Supabase SDKs target Node.)

2. CSV import shape for the MVP: parse the CSV synchronously inside the request. Real Letterboxd and IMDb exports run from a few hundred to a few thousand rows, and Vercel functions now default to a 300 second maximum duration (with fluid compute enabled by default), so an in-request parse plus per-row catalog validation plus embedding is comfortable at that size. The threshold to revisit: when a single import's total work (parse plus per-row catalog lookups plus embedding generation) risks approaching the function's max duration, roughly the 10,000-plus row range, or whenever per-row external calls are not batched, move to a background or chunked approach. The exact number is the import feature ADR's to set. (basis: Vercel maximum-duration docs, 300s default on all plans with fluid compute.)

## Rationale

The forces that decide this are small team, ship fast, login-walled per-user data, and an AI-plus-vector core. Every choice below serves those.

Why Supabase over Neon-plus-separate-auth. The strongest force is a small team that has to keep the moving parts few. Supabase collapses three layers (database, vectors, auth) into one platform, so there is no user-sync seam between an auth vendor and a data vendor, and row-level security policies run against an identity that lives in the same system as the data. Option 2 buys independent vendors and nice branching, but it pays for that with a seam the team has to build and maintain on day one, which is the opposite of ship fast. We consciously accept backend-as-a-service coupling to Supabase in exchange for one platform to learn and operate (named honestly in Consequences).

Why pgvector over a dedicated vector database. The core query is not "find similar vectors" in isolation. It is "find movies whose metadata vector is close to this taste vector, that this user has not already seen, joined to catalog rows." Keeping the vectors in the same Postgres means that is one query with normal SQL filters and joins. A dedicated vector database (Pinecone, Qdrant) would split that into a vector lookup plus a relational fetch plus a consistency problem, for scale we do not have. At well under ~10M vectors, pgvector is the simple, correct choice. (basis: landscape check; pgvector supports HNSW and IVFFlat indexes and cosine or inner-product distance in Postgres.)

Why Next.js full-stack over a front-end-plus-API split. One deployable is less to build, deploy, and operate than two. Server actions and route handlers let the sign-in-to-recommendation thread run server code (database reads, Claude calls) right next to the UI that needs it, which is exactly what the Tracer Bullet build approach wants for its thin first slice. A separate Node API (Option 3) adds a second service and nudges toward hand-built auth, which is a known source of security bugs.

Why Claude. The AI has two jobs, and they have different cost shapes. Parsing a vibe query into structured intent and validating output are frequent and want a cheap fast model (Haiku class). Writing a genuinely good one-line reason is less frequent and wants a stronger model (Sonnet or Opus class). Claude follows structured-output instructions well and offers exactly that tier split, so we can spend money only where quality shows. (basis: Anthropic models overview lists Haiku, Sonnet, and Opus tiers.)

Why Node serverless and synchronous import. Covered in the RECOMMEND picks above. Both choices favor the boring path that the chosen libraries and the real data sizes actually support, and both name the concrete point at which the assumption breaks.

## Consequences

Positive:

- One platform for data, vectors, and auth, and one host for the app. A small team can hold the whole system in its head.
- Row-level security enforces per-user isolation in the database, so a query mistake in app code cannot leak another user's ratings or watchlist. This guarantee holds ONLY if server-side access (server actions and route handlers) uses a user-scoped Supabase client that carries the signed-in user's token, so the policies actually run. Using the service-role key on user data paths bypasses RLS entirely and turns isolation back into app-code discipline, which defeats the point. The rule for this project: reach for the service-role client only in explicit admin or system paths, never for reading or writing a user's own rows. (basis: Supabase RLS docs, policies restrict the rows each user can access; the service-role key bypasses them.)
- Vectors and relational data share one query path, which keeps the matching core simple and fast to iterate on.
- The Claude tier split keeps AI cost controllable, cheap model for the frequent parsing, stronger model only for the written reasons.
- Everything here is mainstream and well documented, which suits an education-oriented build.

Negative (the honest costs):

- Backend-as-a-service coupling to Supabase. Supabase owns the database, auth, and the connection pooler. Moving auth off Supabase later means re-homing user identity and rewriting row-level security assumptions, which is real migration work. We accept this for the simplicity it buys now.
- Serverless execution time limits. A single request has a bounded max duration (300s default on Vercel with fluid compute). Large synchronous CSV imports can approach that ceiling, so the import feature must watch its per-row work and move to background or chunked processing past roughly the 10,000-plus row range (see Follow-up). (basis: Vercel duration docs.)
- Partial-failure risk in the synchronous import, live well before the duration ceiling. A single import bundles three fragile legs (parse the CSV, validate each row against TMDB, generate embeddings), and TMDB is rate limited while the embeddings API can hiccup. If a 2,000-row import fails halfway, the user must not silently end up with half a taste profile. So the import feature ADR (feature 7) MUST specify a retry, resume, and idempotency story (batch the TMDB lookups, make re-running the import safe, and either finish or roll back a profile rather than leaving it half-built). This is a correctness requirement, not just a scaling one, and it is named here so the import ADR is bound to address it.
- pgvector has a ceiling. It is the right tool below ~10M vectors. If the catalog ever grows into the tens of millions of vectors, index build and query latency will force a rethink (a dedicated vector store, or index tuning). Not a near-term risk, but named so it is not a surprise.
- Claude cost per call is real. Without the cheap-tier split it would add up, so the tier split is load-bearing, not optional, and reason writing should be batched or cached where possible.
- TMDB terms and limits apply. The API is free but rate limited, and it requires attribution ("This product uses the TMDB API but is not endorsed or certified by TMDB") plus the TMDB logo and a link back. That attribution is a product requirement, not a nice-to-have. (basis: TMDB API FAQ attribution requirement.)
- Serverless database connections need the pooler. Serverless functions open many short-lived connections, which can exhaust Postgres. Supabase's Supavisor pooler in transaction mode is the intended fix, so the app must connect through the pooler, not directly. (basis: Supabase connecting-to-Postgres docs recommend transaction-mode pooling for serverless.)

Neutral:

- Cold starts exist on serverless. Acceptable for a login-walled MVP, worth remembering if a specific route feels slow after idle.
- Observability is deliberately thin. Structured logs plus error boundaries plus host logs cover the MVP; the first production incident that is hard to diagnose is the signal to add Sentry (deferred, see Follow-up).

## Follow-up

- Embeddings model decision. Owned by the recommendation-engine ADR (feature 7, "CSV import & taste profile"). Anthropic has no first-party embeddings model, so that ADR picks a dedicated embeddings API (for example Voyage AI, which pairs with Claude, or OpenAI embeddings). Not decided here.
- pgvector index and tuning. Deferred but not free: the engine ADR must choose the index type (HNSW versus IVFFlat) and tune it (for HNSW, the build parameters and `ef_search`; for IVFFlat, `lists`) against a real recall test. Even at a modest catalog (tens of thousands of movies) the wrong default can ship recommendations that are silently mediocre or slow. Carry this as a required decision in the engine ADR, not an afterthought.
- TMDB catalog and validation mechanics. Owned by the catalog ADR (feature 4, "Movie catalog & validation"): caching, sync and freshness, and how imported CSV rows and AI output are validated against the catalog.
- CSV large-import threshold. The import feature ADR sets the concrete row count and per-row work budget at which synchronous parsing must give way to background or chunked processing (guidance above: revisit around the 10,000-plus row range or when per-row external calls are not batched).
- TMDB API key and attribution. Obtain an API key and build the required attribution (notice, TMDB logo, link back) into the UI before any public exposure.
- Deferred observability and consent. External error tracking (Sentry), product analytics, and cookie or consent flows are out of the MVP and tracked on the roadmap's Deferred list.
- Community skills (optional). No Supabase or Next.js conventions skill is installed. Neither is required to build, but either would help later implementation consistency.

## References

### Project sources

- `docs/roadmap/roadmap.md` — Reel roadmap; feature 1 (Stack & architecture), feature 4 (Movie catalog & validation), feature 7 (CSV import & taste profile).

### Practices & standards

- Monolith first for a small team (one deployable, fewest moving parts).
- Never build auth from scratch (use a managed auth provider with database-enforced row-level security).
- Relational database as the default store; add a specialized store only when scale demands it.
- Keep vectors beside relational data until scale (~10M vectors) forces a dedicated vector store.

### Links (web verified)

- Next.js App Router, Server Actions and mutations: https://nextjs.org/docs/app/getting-started/mutating-data (verified, Next.js 16.2.10 docs).
- Vercel function maximum duration (300s default with fluid compute): https://vercel.com/docs/functions/configuring-functions/duration
- Supabase row-level security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase connecting to Postgres (Supavisor transaction-mode pooling for serverless): https://supabase.com/docs/guides/database/connecting-to-postgres
- pgvector (Postgres vector similarity search, HNSW and IVFFlat, cosine and inner-product distance): https://github.com/pgvector/pgvector
- Anthropic Claude models overview (Haiku, Sonnet, Opus tiers): https://platform.claude.com/docs/en/docs/about-claude/models/overview
- TMDB API FAQ (attribution requirement): https://developer.themoviedb.org/docs/faq
