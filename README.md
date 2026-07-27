# Reel

A recommendation-first movie web app. Import your Letterboxd or IMDb rating history (CSV) to get an instant taste profile, or build one through onboarding, and get personal picks (a ranked feed and a natural-language vibe search) each with a one-line reason. Every title is validated against TMDB, so nothing is invented. The app is fully login-walled. The matching engine (taste vectors matched against movie metadata) is the core.

## Features

- **CSV Import**: Import Letterboxd or IMDb rating history to generate a taste profile
- **Onboarding**: Quick genre + swipe-based profile setup for users without import history
- **Recommendation Feed**: Ranked movie picks with personalized one-line reasons
- **Vibe Search**: Natural-language search (e.g., "something fun for a Friday night")
- **Watchlist**: Save and manage your recommended movies
- **Movie Details**: Metadata from TMDB for every title

## Stack

- **Language**: TypeScript (strict)
- **Framework**: Next.js 16 (App Router, Turbopack), React 19
- **Database**: Supabase (managed Postgres) with `pgvector` extension
- **Auth**: Supabase Auth with row-level security (RLS)
- **AI**: Anthropic Claude (vibe parsing, reason generation)
- **Embeddings**: OpenAI `text-embedding-3-small`
- **Movie Data**: TMDB (The Movie Database)
- **Styling**: Tailwind CSS v4 with design tokens (`design.md`)
- **UI**: Radix UI primitives, motion for animation, Fraunces + Inter fonts

## Getting Started

### Prerequisites

- Node.js 20+
- npm
- Supabase account
- TMDB API key
- Anthropic API key
- OpenAI API key

### Setup

1. Clone the repository and install dependencies:

```bash
git clone https://github.com/GiorgiKavtaradze-prog/andwatch.git
cd andwatch
npm install
```

2. Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

3. Set up the database:

```bash
# Apply migrations via Supabase CLI or SQL editor
npx supabase db push
```

4. Seed the movie catalog:

```bash
npm run seed:movies
```

5. Backfill embeddings for the catalog:

```bash
npm run backfill:embeddings
```

6. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build (includes TypeScript check) |
| `npm run start` | Run the production build locally |
| `npm run lint` | Lint with Biome |
| `npm run format` | Format with Biome |
| `npm run check` | Biome check (lint + format) with fixes |
| `npm run seed:movies` | Populate the movie catalog from TMDB |
| `npm run backfill:embeddings` | Embed catalog movies without vectors |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

## Project Structure

```
src/
├── app/           # Routes and layouts (App Router)
│   ├── auth/      # Authentication routes
│   ├── import/    # CSV import flow
│   ├── onboarding/ # Onboarding flow
│   ├── search/    # Vibe search
│   ├── feed/      # Recommendation feed
│   └── movie/[id]/ # Movie detail pages
├── components/    # Shared UI components
│   ├── ui/        # Base primitives (button, card, etc.)
│   └── *.tsx      # Product components
├── lib/           # Shared, reusable code
│   ├── supabase/  # Database clients and auth
│   ├── catalog/   # Movie catalog and validation
│   ├── embeddings/ # OpenAI embedding helpers
│   ├── taste/     # Taste vector computation
│   ├── feed/      # Recommendation engine
│   ├── search/    # Vibe search
│   └── tmdb/      # TMDB API client
supabase/
└── migrations/    # Database migrations
scripts/
├── seed-movies.ts         # Movie catalog seeding
└── backfill-embeddings.ts   # Embedding backfill
docs/
├── adr/           # Architecture decision records
├── roadmap/       # Feature roadmap
└── hardening/     # Hardening checklists
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (public) |
| `SUPABASE_SECRET_KEY` | Supabase service role key (server-only) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `TMDB_API_KEY` | TMDB API key |
| `TMDB_API_READ_ACCESS_TOKEN` | TMDB read access token |
| `OPENAI_API_KEY` | OpenAI API key for embeddings |

## Development

### Code Style

- Functional and immutable style
- TypeScript strict mode (no implicit `any`)
- Biome for linting and formatting
- Components use `"use client"` only when needed (callbacks, Radix, motion)

### Database

- All user data is protected by RLS policies
- Use user-scoped clients (`client.ts`/`server.ts`) for user data paths
- Use service client (`service.ts`) only for system/admin operations

### Testing

- Unit tests with Vitest (jsdom environment)
- Test files co-located with source (`*.test.ts`)
- Mock external services (DB, TMDB, OpenAI) at boundaries

## Roadmap

See [docs/roadmap/roadmap.md](docs/roadmap/roadmap.md) for the full feature roadmap.

Current status:
- ✅ Stack & architecture
- ✅ Coding standards & tooling
- ✅ Data model
- ✅ Movie catalog & validation
- ✅ Design system & UI foundation
- ✅ Accounts & auth
- ✅ CSV import & taste profile
- 🔄 Recommendation feed with reasons (in-progress)
- 🔄 Onboarding (in-progress)
- 🔄 Natural-language vibe search (in-progress)

## License

Private project.