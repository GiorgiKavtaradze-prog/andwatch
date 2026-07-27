# 0008. Onboarding (genres + swipe) for Reel

**Date**: 2026-07-05
**Status**: In Progress

## Summary

This decides how a signed-in user with no import builds a starting taste profile: they pick a few genres, then swipe through a deck of real, popular, already-embedded movies (like / dislike / skip). Each like or dislike is saved as a rating with `source = 'onboarding'`, and once they have made enough decisions we run the exact same taste-profile computation the import uses (ADR 0006), producing the same `taste_profiles.vector` the feed reads. It feeds straight into the recommendation feed from feature 8. There is **no new table and no AI call**: onboarding is a thin new UI plus two server actions on top of the engine that already exists.

## Context

Feature 7 (ADR 0006) gives a power user with a rating history an instant taste profile. Everyone else needs a way in that does not require a CSV. This is that path. The core asset the feed consumes is `taste_profiles.vector` (a 1536-dim unit vector), and ADR 0006 already produces it from a user's `ratings` via `computeTasteProfile(supabase, userId)`: a rating-weighted average of the embeddings of the movies they rated. Onboarding's whole job is to produce enough `ratings` rows for that function to run.

The data model already supports this with nothing new. `ratings.source` has a `check (source in ('letterboxd','imdb','onboarding'))` constraint, so onboarding ratings are a first-class, already-anticipated source. `taste_profiles` and `profiles.onboarding_completed` already exist (ADR 0002). `SwipeCard` (feature 5) already renders a movie with like/dislike controls and drag gestures. `getCandidates` (ADR 0003) already reads real, popular catalog movies. So onboarding reuses the entire stack and adds only a deck builder, two server actions, and the onboarding screen.

Because selection is over real `movies` rows and the only "generation" is the deterministic taste vector, there is **no hallucination surface and no Claude call here** (unlike the feed's reason writer or vibe search). Onboarding writes user data (`ratings`, `taste_profiles`), so it runs through the user-scoped Supabase client with row-level security, exactly like the import.

> ⚠️ Premise note: three real forces to name before building, none of them blockers.
>
> 1. **The roadmap says "roughly 15 swipes," but the taste-profile floor is 20.** ADR 0006 sets `MIN_RATINGS_FOR_PROFILE = 20`: fewer than 20 matched, embedded ratings and no vector is built (the feed would be too noisy). Onboarding's "done when" is that the user "lands on a populated recommendation feed," which is impossible below the floor. So onboarding requires **at least 20** like/dislike decisions, not 15. We correct the seed here rather than lower the engine floor (lowering it would also degrade thin imports). The deck is sized with headroom (about 30 cards, refilled as needed) so reaching 20 is easy. Raising the floor later is a one-line change in ADR 0006's engine, and onboarding would follow it.
> 2. **Only embedded movies move the vector.** `computeTasteProfile` skips any rated movie whose `embedding` is null. So the deck must be built from **embedded** movies (`embedding is not null`), or a user could swipe 20 times and still get a below-floor profile. The deck query filters on this, so every swipe counts.
> 3. **A thin or sparsely-embedded catalog can starve the deck.** If the chosen genres have fewer than 20 embedded, unrated movies, the user cannot reach the floor. We broaden (drop the genre filter to fill the deck from popular embedded movies) before giving up, and if even that is short we show an honest "not enough to build a profile yet" state rather than fabricating a noisy one. This is the same thin-catalog reality the feed names, surfaced one step earlier.

## Requirements

**User stories**

- As a signed-in user with no import, I want to build a taste profile by picking genres and swiping a few movies, so I can get a personal feed without uploading a file.
- As a user, I want to see how close I am to finishing, so the task feels bounded.
- As a user, I want onboarding to end on a real, populated feed, so the effort pays off immediately.
- As a user who already has a profile, I do not want to be forced through onboarding again.

**Acceptance criteria**

- **AC-1**: A signed-in user without a taste vector can open `/onboarding`, pick 1 to 5 genres, and get a swipe deck of real, embedded, popular movies matching those genres, excluding any movie they have already rated.
- **AC-2**: The user swipes each deck movie like / dislike / skip; a like or dislike is recorded as a `ratings` row with `source = 'onboarding'` (like → `normalized_value` 100, dislike → 0), and a skip is not recorded.
- **AC-3**: Onboarding requires at least the taste-profile floor (20, from ADR 0006) of like/dislike decisions before it can finish; a live progress indicator shows how many more are needed; the deck refills (broadening past the chosen genres if needed) so the user can reach the floor when the catalog allows.
- **AC-4**: On finish, the collected swipes are persisted and `computeTasteProfile` runs (reusing ADR 0006), producing the same `taste_profiles.vector` the feed consumes; `profiles.onboarding_completed` is set true; the user is routed to `/feed`.
- **AC-5**: If the user cannot reach the floor because the catalog is too thin (fewer than 20 embedded, unrated movies available even after broadening), onboarding says so honestly and does not write a taste vector (the below-floor path from ADR 0006); the swipes are still saved as ratings.
- **AC-6**: All catalog reads and rating writes run server-side. Rating writes and `computeTasteProfile` go through the user-scoped RLS client (onboarding ratings are user data, never the service key); the deck's catalog read uses the system/service path (movies are shared read-only data).
- **AC-7**: The onboarding page renders genre-pick, swipe-deck with progress, finishing/loading, and thin-catalog states, built to `design.md`, reusing the existing `SwipeCard`.
- **AC-8**: A user who already has a taste vector is routed straight to `/feed` when they open `/onboarding` (onboarding is the no-profile path).

## Options considered

### Option 1 (chosen): swipe deck of embedded catalog movies → onboarding ratings → the existing taste-profile computation

Pick genres, swipe a deck of embedded popular movies, save likes/dislikes as `source = 'onboarding'` ratings, then call `computeTasteProfile`. No new table, no AI.

- Pro: reuses the entire engine (ADR 0006), the catalog (ADR 0003), and the `SwipeCard` (feature 5); the vector it produces is identical in shape and quality path to an import's, so the feed treats an onboarded user exactly like an imported one.
- Pro: no migration, no new provider, no hallucination surface; the smallest possible new code (a deck builder, two actions, one screen).
- Con: the user must make 20 decisions (more than the "15" seed) for a usable vector, and a thin catalog can make even 20 hard.

### Option 2: genre-only profile (no swipes)

Build the profile from the picked genres alone, writing `genre_affinities` and skipping the vector.

- Pro: fastest onboarding (just pick genres).
- Con: the feed ranks by the **taste vector**, not genre affinities (ADR 0007), so a genre-only profile gives the feed nothing to rank with. It would either force a weaker genre-overlap feed (the rejected Option 3 of ADR 0007) or leave the vector null (no feed). It does not satisfy the "lands on a populated feed" promise.

### Option 3: AI-generated seed profile from a text prompt

Ask the user to describe their taste in words and have Claude pick seed movies.

- Pro: conversational, low-friction.
- Con: that is essentially vibe search (feature 10), not onboarding; it adds an AI call and a hallucination-validation surface for a job that deterministic swiping does cleanly. Reserving natural-language taste for feature 10 keeps onboarding simple and free.

## Decision

**Chosen option**: Option 1. A genre pick narrows a swipe deck of real, embedded, popular movies; likes and dislikes become `source = 'onboarding'` ratings; once the user clears the taste-profile floor we run the existing `computeTasteProfile`, set `onboarding_completed`, and send them to the feed.

The RECOMMEND picks, each with a one-line why and its runner-up:

1. **Deck source: a dedicated service-client query for embedded, popular, genre-matching, unrated movies** (`src/lib/onboarding`), not raw `getCandidates`. `getCandidates` filters by genre and popularity but does not require `embedding is not null` and does not exclude the user's rated movies, both of which onboarding needs (force 2 of the premise note, and re-entry). So onboarding gets its own small builder that adds `.not('embedding','is',null)` and an id-exclusion, ordered by `popularity desc`. Runner-up: extend `getCandidates` with an `embeddedOnly` + `excludeIds` option (fewer files, but loads onboarding concerns into the shared catalog filter that feature 10 also uses).
2. **Binary rating mapping: like → 100, dislike → 0, on the existing 0-100 `normalized_value` scale** (`raw_value` 1/0, `raw_scale` `'binary'`). This gives the centroid computation a strong bimodal signal: liked movies (above the user's mean) pull the vector toward them, disliked (below) push away, exactly the `(rating - mean)` weighting ADR 0006 uses. Runner-up: a three-way like/neutral/dislike (adds a middling signal that mostly dilutes the vector for little gain in a short session).
3. **Finish in one `completeOnboarding` action, not an import-style chunk loop.** Onboarding is one short sitting over already-cached, already-embedded movies, so there is no TMDB resolution or embedding to do per swipe (the expensive parts of the import). The client accumulates swipes and sends them once; the action upserts the ratings and computes the profile in one call. Runner-up: persist each swipe as it happens for resumability (more robust to a mid-session drop, but more round trips for a task that takes a minute; a resumable variant is a Follow-up).
4. **The floor is the finish gate, with a live "N more to go" counter and deck refill.** The finish control unlocks at 20 like/dislike decisions; below that the deck keeps serving cards (broadening past the chosen genres once the genre-matched embedded pool is exhausted) so the user can get there. Runner-up: a fixed 15-card deck (matches the seed but cannot build a profile, per premise note 1).
5. **Genre list: the standard TMDB genre names, as a small hardcoded constant** matching the names stored in `movies.genres`. The catalog is seeded from TMDB (ADR 0003), so its genre names are TMDB's; hardcoding the picker's options keeps onboarding from needing a genres query and guarantees the picked names match what the deck filter compares against. Runner-up: derive the genre list from a `distinct` query over the catalog (always in sync, but an extra query for a list that is effectively fixed).
6. **No new table; reuse `ratings`, `taste_profiles`, and `profiles.onboarding_completed`.** The data model (ADR 0002) already anticipated onboarding (`source = 'onboarding'`), so onboarding is migration-free. Runner-up: none, this is a statement of posture.

## Rationale

The load-bearing insight is that onboarding is not a new engine, it is a new **way to produce ratings** for the engine that already exists. ADR 0006 already turns any set of a user's ratings into the taste vector, and it recomputes from **all** of a user's ratings across every source, so onboarding ratings and (later) import ratings compose cleanly. That is why Option 2 (genre-only) is rejected: the feed ranks by the vector, and a genre pick alone produces no vector, so it does not deliver the promised populated feed. And it is why Option 3 (AI seed) is deferred: deterministic swiping produces a real, grounded vector with no AI cost and no hallucination risk, and the natural-language taste path is exactly what feature 10 is for.

The premise note's first force is the one real correction: the "15 swipes" seed cannot clear the 20-rating floor, so onboarding requires 20. We size the deck with headroom and refill it rather than lowering the engine floor, because the floor protects feed quality for imports too. The second and third forces (embedded-only deck, thin-catalog honesty) fall straight out of how `computeTasteProfile` already behaves: it skips un-embedded movies and returns below-floor rather than building a noisy vector, and onboarding simply respects both.

Leaning on what exists keeps the surface tiny: the `SwipeCard`, the catalog read, the three-client Supabase setup and `getUser()` gate, the discriminated-union result shape, and the taste computation are all already here. The only genuinely new pieces are one deck query, two thin server actions, and one screen, and none of them touch the database schema or add a vendor.

## Feature design

### Data model

**No new table. No migration.** Onboarding reuses:

- `ratings` — writes `source = 'onboarding'` rows: `{ user_id, movie_id, source: 'onboarding', raw_value: 1|0, raw_scale: 'binary', normalized_value: 100|0, rated_at: now() }`, upserted on the existing `unique (user_id, movie_id)` so a re-swipe of the same movie updates rather than duplicates.
- `taste_profiles` — written by `computeTasteProfile` (ADR 0006), unchanged.
- `profiles.onboarding_completed` — set `true` on finish.

**Deck query** (`buildOnboardingDeck`, service client, movies are shared read-only data): `select <MOVIE_COLUMNS> from movies where embedding is not null and synced_at is not null [and genre overlaps chosen genres] and id not in (<already-rated ids>) order by popularity desc nulls last limit <size>`. Genre overlap is applied the way `getCandidates` does it (over-fetch, filter in memory on `genres[].name`), then broadened (genre filter dropped) if the genre-matched embedded pool is under the floor.

### State transitions

```
no profile ──▶ /onboarding
                 │
     pick 1..5 genres
                 ▼
           swipe deck ──(like/dislike, refill as needed)──▶ decisions ≥ 20 ──▶ finish enabled
                 │                                                                   │
          catalog too thin                                             completeOnboarding
          (< 20 embedded)                                                            │
                 ▼                                                    computeTasteProfile
        thin-catalog state                                                           │
        (ratings saved, no vector)                              ┌────────────────────┴───────────┐
                                                        computed (vector)                 below-floor
                                                                │                               │
                                                          set onboarding_completed        thin-catalog
                                                          ──▶ redirect /feed              state + retry

already has a vector ──▶ redirect /feed
```

### API surface

Internal server actions, not public REST. All user data through the user-scoped RLS client, gated by `getUser()`.

| Function | Module | Key inputs | Key outputs | Auth path | Key errors |
| --- | --- | --- | --- | --- | --- |
| `getOnboardingDeck` | server action, `src/app/onboarding` | `genres: string[]` (1..5) | `{ status: 'ok'; deck: Movie[] }` \| `{ status: 'thin'; deck: Movie[] }` \| `{ status: 'has-profile' }` | user-scoped read of the user's rated ids; system read of the catalog | not signed in → redirect |
| `completeOnboarding` | server action, `src/app/onboarding` | `swipes: { movieId: number; liked: boolean }[]` | `FinalizeResult` (`computed` \| `below-floor` \| `failed`) from ADR 0006 | user-scoped (RLS) rating upsert + `computeTasteProfile` | not signed in; write failure |
| `buildOnboardingDeck` | `src/lib/onboarding` | `genres`, `excludeIds`, `size` | `Movie[]` (embedded, popular, genre-matched, unrated) | system/service read (catalog) | none (returns fewer when thin) |

`getOnboardingDeck` returns `has-profile` when a taste vector already exists so the page can redirect. `completeOnboarding` reuses `computeTasteProfile`'s existing `FinalizeResult`, so the below-floor and computed paths are already modeled.

### Key invariants

- **Only unrated, embedded, real movies enter the deck.** So every swipe is a real catalog row that will actually move the vector, and re-entry never re-shows a rated movie.
- **The vector is only written at or above the floor.** `computeTasteProfile` returns below-floor without writing a vector under 20 matched ratings; onboarding never fabricates a profile.
- **Onboarding ratings and import ratings compose.** Both write to `ratings`; the profile always recomputes from all of them, so onboarding then importing (or vice versa) enriches rather than conflicts.
- **User data through the user-scoped client.** Rating writes and the taste computation run under RLS; the service key is used only for the shared catalog read.
- **Idempotent finish.** Ratings upsert on `(user_id, movie_id)`, so a double-submit of the same swipes does not duplicate or double-count.

### Security model

`ratings` and `taste_profiles` are user-owned: written through the user-scoped client (`server.ts`) so RLS enforces ownership, gated by `getUser()` (never `getSession()`). The catalog read (`buildOnboardingDeck`) uses the service client because `movies` is shared read-only data (the same split the import uses for resolution/embedding). No new secrets, no new vendor. This is per-user data isolation, not a regulated-data scope.

### Configuration required

- None new. Reuses the existing Supabase env vars. No Anthropic, no OpenAI on this path (onboarding does not embed or call an LLM; the deck movies are already embedded).

### Critical test scenarios

- **Happy path (AC-1..AC-4)**: pick 3 genres → deck of embedded popular matches → swipe 20+ like/dislike → finish → a taste vector is written, `onboarding_completed` is true, `/feed` is populated.
- **Floor gate (AC-3)**: the finish control is disabled until 20 like/dislike decisions; skips do not count; the counter shows the remaining number.
- **Deck refill and broadening (AC-3)**: when the genre-matched embedded pool runs low, the deck refills from popular embedded movies outside the chosen genres so the user can still reach 20.
- **Thin catalog (AC-5)**: with fewer than 20 embedded unrated movies available, onboarding shows the honest thin state, saves the swipes as ratings, and writes no vector (below-floor).
- **Rating shape (AC-2)**: a like writes `normalized_value = 100`, a dislike `0`, `source = 'onboarding'`; a skip writes nothing; re-swiping a movie upserts (no duplicate).
- **Already onboarded (AC-8)**: a user with a taste vector who opens `/onboarding` is redirected to `/feed`.
- **Auth (AC-6)**: a signed-out user cannot reach onboarding actions; rating writes go through RLS (a user cannot write another user's ratings); the service key is used only for the catalog read.

## Build plan

Tracer-Bullet: complete Slice 2's no-CSV path end to end. There is **no migration** (the data model already supports onboarding), so the plan starts at the deck builder. Every task tags the AC(s) it satisfies.

1. **Onboarding lib** (`src/lib/onboarding`): the TMDB genre-name constant list; `buildOnboardingDeck(genres, excludeIds, size)` — a service-client query for embedded (`embedding is not null`), `synced_at`-present, popular movies, genre-matched (over-fetch + in-memory filter like `getCandidates`) and broadened when thin, excluding `excludeIds`. (AC-1)
2. **Server actions** (`src/app/onboarding/actions.ts`): `getOnboardingDeck(genres)` (getUser gate; if a taste vector exists return `has-profile`; else read the user's rated ids, build the deck, return `ok`/`thin`); `completeOnboarding(swipes)` (getUser gate; upsert onboarding ratings via the user-scoped client with the 100/0 mapping; run `computeTasteProfile`; on `computed` set `profiles.onboarding_completed = true`; return the `FinalizeResult`). (AC-2, AC-4, AC-5, AC-6)
3. **Onboarding page + client flow** (`src/app/onboarding`): login-walled page (getUser + redirect); a client leaf that runs genre-pick (multi-select chips, 1..5) → swipe deck (the existing `SwipeCard`, like/dislike, plus a skip control) with a live progress counter and finish-at-floor gate → finishing/loading and thin-catalog states; redirect to `/feed` on `computed`, and to `/feed` immediately on `has-profile`. Built to `design.md`. (AC-3, AC-7, AC-8)
4. **Wire end to end**: the feed's no-profile state already links to `/onboarding`; confirm the full thread (genre pick → 20 swipes → taste vector → populated feed), the thin-catalog path, and the already-onboarded redirect. (AC-1 through AC-8)

AC trace: AC-1→1/2; AC-2→2; AC-3→2/3; AC-4→2; AC-5→2/3; AC-6→2; AC-7→3; AC-8→2/3.

## Consequences

**Positive**

- Delivers the no-CSV on-ramp with the smallest possible surface: no new table, no migration, no new vendor, no AI. An onboarded user's vector is identical in kind to an imported user's, so the feed treats them the same.
- Reuses the `SwipeCard`, the catalog, the taste engine, the Supabase clients, and the result-shape convention, so almost nothing is net-new.
- No hallucination surface: selection is over real embedded catalog rows, and the only computed value is the deterministic taste vector.

**Negative (the honest costs)**

- The user must make at least 20 decisions, more than the "15" seed, because the engine floor demands it. Onboarding is therefore a slightly longer sitting than the roadmap imagined.
- A thin or sparsely-embedded catalog can prevent reaching the floor; onboarding then ends on an honest thin state rather than a feed. This is the same early-data limit the feed already carries, surfaced one step sooner.
- Finishing in one action means a mid-session drop loses the un-submitted swipes (a resumable, incremental-persist variant is a Follow-up).

**Neutral**

- The picked genres also seed `genre_affinities` through `computeTasteProfile`'s existing genre-weighting, so the genre step is not wasted even though the vector does the ranking.
- The binary 100/0 mapping is a deliberate strong signal; a future three-way or graded swipe could refine it without a schema change (`normalized_value` is already 0-100).

## Follow-up

- [ ] Incremental/resumable persistence (save swipes as they happen, like the import chunk loop) if drop-off mid-onboarding proves common.
- [ ] A graded or three-way swipe (love / like / dislike) if the binary signal proves too coarse.
- [ ] Streaming-service selection (deferred on the roadmap) folded into onboarding once a provider-availability data source exists.
- [ ] A "not embedded yet" backfill nudge so a freshly seeded catalog fills the deck faster.
- [ ] Revisit the 20-decision floor against real onboarding completion rates; tune it in ADR 0006 if drop-off is high.
