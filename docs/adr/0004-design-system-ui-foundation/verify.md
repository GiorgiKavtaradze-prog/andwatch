# Verify: Design system & UI foundation · ADR 0004 · updated 2026-07-04
_Steps derived from ADR 0004 acceptance criteria. `/verify` runs these; `/test` locks the durable ones._
_Build-time checks confirmed at build; keyboard/screen-reader/reduced-motion are manual at `/preview`._

## Commands (confirmed at build time)
- [x] `npm run build` → compiles, TypeScript passes, all routes prerender → AC-2
- [x] `npx biome check src` → clean (40 files) → AC-1..AC-6
- [x] `design.md` exists and documents color, typography (Fraunces + Inter), spacing, radius, elevation, motion, and component conventions → AC-1

## Manual (open `npm run dev` → the routes)
- [ ] `/` renders on the dark canvas with a Fraunces serif heading and Inter body (no light flash) → AC-2
- [ ] `/preview` renders every primitive (button variants/sizes/loading, input default + error, label, badges, dialog, skeleton, dropdown menu, avatar) and every product component → AC-3, AC-4
- [ ] The recommendation card shows a real TMDB poster; a card with `poster_path: null` shows the designed fallback (film-frame watermark + title, no broken image) → AC-4, AC-5
- [ ] The TMDB attribution (notice + logo linking to themoviedb.org) renders in the app-shell footer → AC-5
- [ ] Keyboard only: tab through `/preview`; every interactive control shows the gold focus-visible ring; the dialog traps focus, closes on Escape, and returns focus to its trigger; the swipe Like/Dislike buttons are reachable and operable → AC-3
- [ ] The watchlist toggle exposes `aria-pressed`; the vibe-search input is a labelled `role="search"` form; icon-only buttons have `aria-label` → AC-3, AC-4
- [ ] Enable OS reduced-motion: the swipe card fades and advances instead of rotating/flying; poster/card reveals do not transform → AC-6
- [ ] Screen reader (VoiceOver/NVDA): the swipe decision is announced (live region); the app-shell landmarks (header/nav/main/footer) and skip-to-content link are present → AC-3

## Acceptance-criteria coverage
- AC-1 (design.md) → confirmed · AC-2 (Tailwind v4 + tokens + fonts + dark default) → confirmed · AC-3 (accessible primitives) → built, manual keyboard/AT pass pending · AC-4 (product shells + states) → confirmed at /preview · AC-5 (posters + fallback + attribution) → confirmed · AC-6 (motion + reduced-motion) → built, manual reduced-motion pass pending
