# 0004. Design system and UI foundation

**Date**: 2026-07-04
**Status**: Accepted

## Summary
Reel is a design-led product with no styling system yet, so before any screen is built it needs one shared, distinctive, accessible visual foundation. The direction is cinematic dark and editorial (deep dark canvas, posters lead, a refined serif for titles, a clean sans for everything else), built on Tailwind CSS v4 (CSS-first tokens) plus headless copy-in primitives (Radix under the hood, shadcn-style, we own the code). This feature produces `design.md` (the single visual source of truth) plus the accessible base primitives and the product-specific shared components, all dark-first. The components ship as styled, accessible shells; later features wire them to real data.

## Context

> ⚠️ Premise note: I scrutinized the confirmed decisions and they hold, with two care items to name up front and one risk to bound. (1) A serif-headings plus sans-body pairing is legible and premium on a dark canvas, but only with care: load both as variable fonts through `next/font` (no layout shift, no third-party request, `display: swap`), reserve the serif for large sizes (display and headings, not body or dense meta where a high-contrast serif gets tiring), and hold every text color to the AA contrast targets in this spec. (2) Dark-only is fine for accessibility as long as the palette actually hits AA, so hitting AA is written in as a hard requirement, not a hope. (3) Building all four product components as shells now, before their data features exist, risks over-fitting a shell to an unbuilt feature. That is the correct trade for a foundation (a foundation exists precisely so the data features stand on a shared, already-accessible surface), and the risk is bounded by keeping every shell presentational: clear typed props in, callbacks out, no data fetching, no feature logic. Some rework if a feature's needs shift later is expected and cheap. With those noted, the confirmed direction is sound and I am specifying it as given.

Every page in Reel (auth, the recommendation feed, onboarding, vibe search, the movie detail page, the watchlist) depends on a shared look and a shared set of components. Right now there is none: the scaffold ships default Geist fonts and a two-variable `globals.css`, no Tailwind, no components, no `design.md`. Because "great design" is a stated product goal, this foundation cannot be generic. It has to be distinctive and genuinely good, and it has to be accessible, because the product is fully keyboard-and-screen-reader usable by requirement.

The forces at play: a cinematic-editorial aesthetic goal (posters and imagery lead, refined typography, generous space, Letterboxd / Mubi / A24 energy), dark-first for the MVP (design one theme well, but shape the tokens so a light theme can be added later without rework), WCAG AA as a hard baseline for a design-led product, a small team shipping an MVP fast, and the Tracer Bullet build approach (this foundation is the infrastructure that every UI slice stands on, so it gets built as one coherent slice: install the stack, write `design.md`, wire the tokens, build the components, each rendered and checked).

Two fixed inputs from earlier ADRs feed this one. Movie posters come from TMDB: ADR 0003 exposes `posterUrl(posterPath, size)` and the attribution constants in `src/lib/tmdb/attribution.ts`, and this feature consumes them rather than re-deciding the movie data source. TMDB attribution (the notice, the logo, a link back) is a required UI obligation wherever movie data shows, so the app shell carries it.

## Requirements

**User stories**
- As a user, the app feels premium and cinematic, posters lead, and every screen reads as one coherent product.
- As a user who relies on the keyboard or a screen reader, I can operate every control, I can always see where focus is, and reduced-motion is respected.
- As a developer, I can build any screen on a Tuesday from documented tokens and components, without inventing colors, spacing, or a11y behavior per file.
- As a later feature (auth, feed, onboarding, vibe search), I get styled, accessible component shells with clear props and wire them to real data.

**Acceptance criteria**
- AC-1: A `design.md` exists as the single visual source of truth, documenting the dark-theme design tokens (color, typography scale plus fonts, spacing, radius, elevation/shadow, motion) and the component conventions.
- AC-2: Tailwind CSS v4 is set up with the design tokens wired as the theme (CSS-first, `@theme`), fonts loaded via `next/font`, and the app renders in the dark theme by default.
- AC-3: The base primitives (button, input, label, card, badge, dialog, skeleton, toast, dropdown-menu, avatar) exist, are styled to the system, and are accessible: visible focus states, full keyboard operability, correct roles (WCAG AA baseline).
- AC-4: The product-specific shared components exist as styled, accessible shells: recommendation card, swipe card, vibe-search input, and the app shell. Built to the design system, with their loading/empty states; wired to real data by later features.
- AC-5: Movie imagery uses TMDB poster URLs with a graceful fallback when a poster is missing; UI icons use lucide; TMDB attribution renders where required (per ADR 0003).
- AC-6: Motion is set up (a light motion library for key moments plus CSS transitions) with tasteful defaults and prefers-reduced-motion respected.

## Options considered

**Option 1 (chosen): Tailwind v4 plus headless copy-in primitives (shadcn-style, Radix under the hood).**
Tailwind v4 gives a CSS-first token system (`@theme`) that maps our design tokens straight to utilities. The interactive primitives (dialog, dropdown, toast) are copied into the repo as our own code, built on Radix for the hard accessibility behavior (focus trap, keyboard, roles, ARIA). We own the markup and every class, so the look is fully custom. Con: we own the code, which means we maintain it and we do the styling work for each variant and state ourselves (Radix hands us the behavior, not the look).

**Option 2: Tailwind alone with hand-built components (no headless kit).**
Maximum control and the fewest dependencies. We write every component from scratch on plain Tailwind. Con: we would hand-build all of the accessibility for the interactive components (focus trapping and return, roving tabindex, Escape handling, ARIA wiring, scroll lock for the dialog), which is exactly the error-prone work a small team should not re-derive, and getting it wrong quietly breaks the AA requirement.

**Option 3: a full styled component library (MUI, Mantine, or similar).**
Fastest to a working screen, batteries included, accessible out of the box. Con: it fights a custom cinematic look. These libraries ship a heavy, opinionated theme and their own styling engine, so getting to a distinctive editorial-dark aesthetic means overriding the library at every turn (or losing the "great design" goal), and we carry a large dependency and its runtime for components we mostly restyle anyway.

## Decision

**Chosen option**: Option 1. Tailwind CSS v4 with CSS-first design tokens, plus shadcn-style copy-in primitives (Radix under the hood, we own the code), dark-first, producing `design.md` and the base and product components.

The RECOMMEND picks, each with a concrete value, a one-line why, and a runner-up:

- **Fonts: Fraunces (serif, headings and titles) paired with Inter (sans, body and UI), both variable, both loaded via `next/font/google`.** Fraunces is a characterful high-contrast variable serif with optical-size and soft axes that reads as cinematic and editorial at large sizes (the A24 / film-title feel), and Inter is a quiet, bulletproof UI sans that stays legible at 12 to 14px where the serif should not go. Runner-up: Playfair Display (display serif) with Geist Sans (already scaffolded).
- **Palette: a deep near-black warm-neutral canvas, three surface elevations, hairline borders, warm off-white text with two dimmer levels, and a single cinematic marquee-gold accent, plus semantic success/warning/danger.** Gold reads as cinema (marquee lights, golden hour, awards) and is distinctive against the default blue/purple, while the warm off-white text (not pure white) keeps the editorial paper feel. Full values in the Feature design. Runner-up: a cool desaturated palette with a muted teal accent (Letterboxd-adjacent, but less premium and less warm).
- **Scales: a 4px-based spacing scale (Tailwind's default, kept), a role-based editorial type scale (display through caption), a 6-step radius scale, and a dark-tuned elevation set that leans on surface steps and hairline borders more than on drop shadows.** Concrete tables in the Feature design. Runner-up: a denser 8-point-only spacing scale (fewer steps, less room for the generous editorial spacing we want).
- **Motion library: `motion` (the current Motion package, formerly Framer Motion), imported from `motion/react`.** It gives React springs, layout animation, drag gestures (which the swipe card needs), and `useReducedMotion` in one small, tree-shakeable dependency, so the few key moments (swipe, page and poster reveals) are real without hand-rolling a spring or a drag handler. Runner-up: pure CSS transitions plus a tiny standalone gesture library (less code, but we would rebuild the spring and the drag-to-decide interaction).
- **Primitive approach: shadcn-style copy-in components built on Radix.** For a full custom look we want to own the markup and classes while inheriting Radix's audited accessibility, which copy-in gives and a raw-Radix or a styled-kit approach does not (raw Radix means rebuilding the variant and styling boilerplate; a styled kit means fighting a theme). Runner-up: raw Radix primitives styled directly.
- **File layout: `design.md` at the repo root (a source-of-truth companion to `AGENTS.md`); base primitives in `src/components/ui/`; product components at `src/components/` top level; the `cn()` helper and motion tokens in `src/lib`.** This matches the AGENTS.md Next.js-default structure (shared UI in `src/components`, shared code in `src/lib`) and keeps the generic-vs-product seam obvious. Runner-up: `docs/design.md` (tidier under `docs/`, but less discoverable for the tool that reads it on every UI feature).
- **Poster fallback: a designed placeholder tile at the 2:3 poster ratio (deep surface gradient, a faint lucide film-frame watermark, the movie title set in Fraunces), never a broken image.** When `movies.poster_path` is null, a `PosterImage` component renders this placeholder instead of `next/image`, so a missing poster still looks intentional and still names the film. Runner-up: a flat solid tile with only the title (simpler, but flatter and less on-brand).
- **Tailwind v4 setup: CSS-first with `@import "tailwindcss";` and an `@theme` block in `globals.css`, the `@tailwindcss/postcss` PostCSS plugin, no JS config file, tokens defined on `:root` as the dark defaults so the app is dark by default.** This is the current v4 shape and it wires our CSS-variable tokens straight into utilities. Important: Tailwind v4 and the shadcn-for-v4 setup changed significantly and my training may be stale, so `/develop` MUST doc-check the exact current Tailwind v4 plus shadcn setup at build time (via Context7 or the official docs) before wiring it, rather than trusting these version-sensitive details. Flagged honestly.

## Rationale

Tailwind v4 plus headless copy-in primitives is the right base for a custom, accessible look built by a small team. Tailwind's CSS-first `@theme` lets our design tokens (the CSS variables in the palette and scale tables below) become utilities directly, so a developer builds screens straight from the tokens with no config indirection, which serves the "build any screen on a Tuesday" force. Copying in Radix-based primitives means we get the accessibility behavior that is genuinely hard to get right (focus trapping and return for the dialog, keyboard menus, live-region toasts) while owning every class, which is what the "distinctive, not generic" and "WCAG AA baseline" forces both demand. A full styled library (Option 3) would fight the cinematic look, and hand-building the a11y from scratch (Option 2) would risk it.

The fonts and palette serve the cinematic-editorial-dark goal concretely. Fraunces at display sizes gives titles the film-poster, editorial character that a neutral sans cannot, while Inter keeps the dense UI (meta lines, buttons, inputs, the TMDB attribution) crisp and legible where a high-contrast serif would tire the eye. The deep warm-neutral canvas lets posters (which are colorful, high-contrast images) lead, exactly the "imagery leads" intent, and the single marquee-gold accent gives the product one distinctive, premium signature instead of a generic blue. Warm off-white text rather than pure white keeps the whole thing feeling like printed editorial paper rather than a stark console.

Dark-first now, with tokens shaped for later light, is the correct MVP scope. Designing one theme well beats shipping two mediocre ones, and by expressing every color as a CSS variable on `:root` (rather than hard-coding hex in components or gating on `prefers-color-scheme`), a future light theme is a second set of variable values under a selector, not a rewrite. The one non-negotiable is contrast: dark-only is only accessible if the palette hits AA, so AA contrast is a hard requirement here and a build-time check, not an afterthought.

Motion is subtle and tasteful by design. Most of it is CSS transitions on hover and focus using the motion tokens; the `motion` library is reserved for the few moments that need real physics (the swipe-to-decide gesture) or coordinated enter/exit (page and poster reveals). Every one of those respects `prefers-reduced-motion`, both through the CSS media query and through `useReducedMotion` in the Motion components, so motion is a delight for users who want it and simply absent for users who do not.

## Feature design

This section is the design specification. `design.md` (written by `/develop`) is derived from it, so it is complete enough to build both `design.md` and the components from. All tokens live as CSS variables wired into Tailwind v4 `@theme` in `globals.css`, structured so a light theme can be added later by overriding the variables under a `[data-theme="light"]` selector (or a `prefers-color-scheme: light` block) without touching component code.

### Design tokens (dark theme)

**Color.** Values are hex for the dark theme. Each becomes a CSS variable and a Tailwind color token (for example `--color-canvas` yields `bg-canvas`, `text-canvas`).

| Token | Var | Value | Role |
|---|---|---|---|
| Canvas | `--color-canvas` | `#0A0A0C` | App background, deepest layer |
| Surface 1 | `--color-surface-1` | `#141417` | Cards, raised panels |
| Surface 2 | `--color-surface-2` | `#1C1C21` | Popovers, dialog panel, inputs |
| Surface 3 | `--color-surface-3` | `#26262C` | Hover on a surface, higher lift |
| Border | `--color-border` | `#2A2A31` | Default hairline border |
| Border strong | `--color-border-strong` | `#3A3A43` | Emphasized border, dividers |
| Text primary | `--color-text` | `#F5F3EF` | Primary text (warm off-white) |
| Text secondary | `--color-text-secondary` | `#B4B1AA` | Secondary text, meta |
| Text muted | `--color-text-muted` | `#7C7A74` | Muted text, placeholders, captions |
| Accent | `--color-accent` | `#E6B450` | Marquee gold, primary action, focus |
| Accent hover | `--color-accent-hover` | `#F0C266` | Accent hover |
| Accent active | `--color-accent-active` | `#CE9E3C` | Accent pressed |
| Accent foreground | `--color-accent-foreground` | `#0A0A0C` | Text/icon on an accent fill |
| Success | `--color-success` | `#5FBF8F` | Positive status |
| Warning | `--color-warning` | `#E08A3C` | Caution status (orange, distinct from gold) |
| Danger | `--color-danger` | `#E5675E` | Error, destructive |
| Danger foreground | `--color-danger-foreground` | `#0A0A0C` | Text on a danger fill |
| Focus ring | `--color-ring` | `#F0C266` | Focus-visible ring (bright gold) |
| Scrim | `--color-scrim` | `rgba(0,0,0,0.72)` | Dialog overlay (with backdrop blur) |

Contrast (verify at build time): text primary on canvas about 17:1, secondary about 9:1, muted about 4.7:1 (AA for normal text), accent on canvas about 9:1, danger/success/warning on canvas all above 4.5:1. `/develop` runs a contrast checker and adjusts a value only if any pairing misses its target (see Accessibility).

**Typography scale.** Serif is Fraunces (`--font-serif`), sans is Inter (`--font-sans`). Sizes in rem (16px base).

| Role | Font | Size | Line height | Weight | Tracking |
|---|---|---|---|---|---|
| Display | Fraunces | 3.5rem (56) | 1.05 | 600 | -0.02em |
| H1 | Fraunces | 2.5rem (40) | 1.1 | 600 | -0.015em |
| H2 | Fraunces | 2rem (32) | 1.15 | 600 | -0.01em |
| H3 | Fraunces | 1.5rem (24) | 1.2 | 500 | -0.005em |
| H4 / eyebrow | Inter | 1.25rem (20) | 1.3 | 600 | 0 |
| Body large | Inter | 1.125rem (18) | 1.6 | 400 | 0 |
| Body | Inter | 1rem (16) | 1.6 | 400 | 0 |
| Small | Inter | 0.875rem (14) | 1.5 | 400 | 0 |
| Caption / overline | Inter | 0.75rem (12) | 1.4 | 500 | 0.08em (uppercase) |

Weights loaded: Fraunces 400/500/600 (variable), Inter 400/500/600/700 (variable). The "why this fits you" reason line uses Fraunces at body-large size, italic, in text-secondary, to read like a pull quote. The caption/overline role is used for meta labels and the TMDB attribution.

**Spacing.** Keep Tailwind's default 4px-based scale (`1`=4px, `2`=8px, `3`=12px, `4`=16px, `6`=24px, `8`=32px, `12`=48px, `16`=64px, `20`=80px, `24`=96px). Editorial generosity is a convention, not new tokens: page gutters `4` (mobile) to `8`/`12` (desktop), section rhythm `16` to `24`, card padding `4` to `6`, related-element gaps `2` to `3`.

**Radius.**

| Token | Var | Value | Used by |
|---|---|---|---|
| sm | `--radius-sm` | 6px | Badge, small controls |
| md | `--radius-md` | 10px | Button, input |
| lg | `--radius-lg` | 14px | Card, poster tile |
| xl | `--radius-xl` | 20px | Dialog, large panels |
| 2xl | `--radius-2xl` | 28px | Hero surfaces |
| full | `--radius-full` | 9999px | Pills, avatar, icon buttons |

**Elevation / shadow (dark-tuned).** On a dark UI, surface color steps and hairline borders do most of the lifting; shadows are soft and used sparingly. A 1px inset top highlight adds a subtle "catch light" on raised surfaces.

| Token | Var | Value |
|---|---|---|
| e0 | `--shadow-e0` | none (canvas level) |
| e1 (card) | `--shadow-e1` | `0 1px 2px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.03)` |
| e2 (hover/raised) | `--shadow-e2` | `0 4px 14px rgba(0,0,0,0.45)` |
| e3 (popover/dialog) | `--shadow-e3` | `0 16px 40px rgba(0,0,0,0.55)` |
| accent glow (hero/emphasis) | `--shadow-glow` | `0 8px 30px rgba(230,180,80,0.15)` |

**Motion.**

| Token | Var | Value |
|---|---|---|
| Duration instant | `--duration-instant` | 80ms |
| Duration fast | `--duration-fast` | 150ms |
| Duration base | `--duration-base` | 220ms |
| Duration slow | `--duration-slow` | 320ms |
| Duration reveal | `--duration-reveal` | 480ms (page/poster reveal) |
| Ease standard | `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| Ease out (reveal) | `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Ease in-out | `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` |
| Swipe spring (Motion) | (JS) | `{ stiffness: 300, damping: 30 }` |

Defaults: hover and focus transitions use `--duration-fast` with `--ease-standard`; poster and card reveals use `--duration-reveal` with `--ease-out`; the swipe uses the spring. Under `prefers-reduced-motion: reduce`, transforms/scale/drag-fly/parallax are removed and only short opacity changes remain (see Accessibility).

### Fonts

Loaded with `next/font/google` in `src/app/layout.tsx`, both as variable fonts, `display: "swap"`, `subsets: ["latin"]`, exposing CSS variables `--font-serif` (Fraunces) and `--font-sans` (Inter) on `<html>`. Fallback stacks: serif falls back to `Georgia, "Times New Roman", serif`; sans falls back to `system-ui, -apple-system, "Segoe UI", sans-serif`. `next/font` self-hosts the files (no third-party request, no layout shift). The body defaults to `--font-sans`; heading roles opt into `--font-serif`. This replaces the scaffold's Geist / Geist_Mono.

### Component inventory

Base primitives live in `src/components/ui/`. Each is styled to the tokens above and meets the a11y notes. "Focus ring" everywhere means a visible `--color-ring` ring at 2px with a 2px offset on `:focus-visible`.

- **Button** (`ui/button.tsx`) — the primary action control. Variants: primary (accent fill, accent-foreground text), secondary (surface-1 fill, border, primary text), ghost (transparent, surface-2 on hover), destructive (danger fill). Sizes: sm, md, lg, and icon (square, radius-full). States: default, hover, active, focus-visible (ring), disabled (reduced opacity, `disabled` attribute, no pointer), loading (lucide `Loader2` spinner, `aria-busy`, non-interactive). A11y: renders a real `<button>` (or `<a>` when it is a link), icon-only buttons require an `aria-label`, loading sets `aria-busy`.
- **Input** (`ui/input.tsx`) — single-line text field. States: default, hover, focus (border to accent plus ring), disabled, error (danger border, `aria-invalid`, message linked by `aria-describedby`). A11y: always paired with a `<label htmlFor>` (placeholder is never the label); error text is programmatically associated.
- **Card** (`ui/card.tsx`) — surface container, radius-lg, hairline border, shadow-e1, with header/media/content/footer slots. Interactive variant lifts to shadow-e2 with a gentle media zoom on hover. A11y: presentational by default; a clickable card exposes exactly one focus target (see the recommendation card overlay-link pattern), never a div with a click handler.
- **Badge** (`ui/badge.tsx`) — small label pill (genres, "New", a match indicator). Variants: neutral (surface-2), accent, success, warning, danger, outline. A11y: status is conveyed by text, not color alone; contrast meets AA.
- **Dialog** (`ui/dialog.tsx`, Radix Dialog) — modal surface. Scrim (`--color-scrim`) with backdrop blur, surface-2 panel, radius-xl, shadow-e3. Enter/exit: fade plus a slight scale (reduced-motion: fade only). A11y (from Radix): focus trap, focus returns to the trigger on close, Escape closes, `aria-modal`, labelled by `DialogTitle` and described by `DialogDescription`, background scroll locked.
- **Skeleton** (`ui/skeleton.tsx`) — loading placeholder on surface-2 with a soft shimmer. Reduced-motion: static dim block, no shimmer. A11y: decorative blocks are `aria-hidden`; the loading region carries `aria-busy` and a visually-hidden `role="status"` label so screen-reader users hear that content is loading.
- **Toast** (`ui/toast.tsx`, via Sonner) — transient notification. Note: shadcn's own toast is deprecated in favor of Sonner, so the toast primitive is Sonner styled to the tokens. Variants: default, success, error. Auto-dismiss with a manual dismiss button. A11y (from Sonner): an ARIA live region (polite for default, assertive for error), keyboard-dismissable.
- **Label** (`ui/label.tsx`, Radix Label) — the accessible form label every field pairs with via `htmlFor`. Required by the Input a11y rule (the placeholder is never the label), and reused by auth forms and the vibe-search input. A11y: programmatically associates the label with its control.
- **DropdownMenu** (`ui/dropdown-menu.tsx`, Radix DropdownMenu) — the menu the app shell user menu uses (account, sign out), and any later overflow/actions menu. A11y (from Radix): keyboard navigation, roving focus, typeahead, Escape closes, correct `menu`/`menuitem` roles, focus returns to the trigger.
- **Avatar** (`ui/avatar.tsx`, Radix Avatar) — the user avatar in the app shell, with an initials fallback when there is no image (never a broken image). A11y: `alt`/label describing the user; the fallback is real text.

Product components live at `src/components/` top level (plus two shared helpers). Each is a presentational shell: typed props in, callbacks out, no data fetching, no feature logic.

- **PosterImage** (`components/poster-image.tsx`) — shared movie-art element used by the cards. Props: `posterPath: string | null`, `title: string`, `size`. Renders `next/image` from `posterUrl(posterPath, size)` (ADR 0003) at the 2:3 poster ratio when a path exists; renders the designed fallback (deep surface gradient, faint lucide film-frame watermark, the title in Fraunces) when `posterPath` is null. A11y: image `alt` is the movie title; the fallback conveys the title as real text.
- **RecommendationCard** (`components/recommendation-card.tsx`) — the hero product component: one recommended movie. Parts: PosterImage (with fallback), title (Fraunces, H3/H4), a meta line (year, runtime, genres as Badges), the one-line "why this fits you" reason (Fraunces italic, secondary, pull-quote styling), an optional match indicator (Badge), and an add-to-watchlist affordance (lucide `Bookmark` / `BookmarkCheck` icon button that toggles filled). Props: `movie`, `reason: string`, `inWatchlist: boolean`, `onToggleWatchlist`, `loading?`. States: default, hover (poster gentle zoom plus card lift to e2), focus (ring on the card action), loading (skeleton: poster block plus two text lines). A11y: the poster/title is one link to the detail page using the overlay-link pattern (a single stretched link so the card is one focus target, not nested interactives); the watchlist control is a separate real toggle button with `aria-pressed` and `aria-label="Add {title} to watchlist"` / "Remove {title} from watchlist".
- **SwipeCard** (`components/swipe-card.tsx`) — onboarding like/dislike card. Parts: PosterImage, title, a short meta line, and explicit Like / Dislike buttons (lucide `Heart` / `X`). Motion: `motion` drag on the x-axis with rotate and a colored like/nope hint overlay, a spring on release, and a throw off-screen on decision. Props: `movie`, `onLike`, `onDislike`. States: idle, dragging, committed (flies out), empty (deck exhausted, an "All caught up" state). A11y: never mouse-only, the Like/Dislike buttons make it fully keyboard-and-screen-reader operable, each has an `aria-label`, the decision is announced via an `aria-live` region, and under reduced-motion there is no rotate or fly-out (the card fades and the deck advances).
- **VibeSearchInput** (`components/vibe-search-input.tsx`) — the natural-language search field. A prominent editorial input (placeholder like "Describe a vibe...") with a leading lucide `Sparkles` icon, a submit affordance, and optional example chips (Badges as buttons) below. Props: `value`, `onChange`, `onSubmit`, `examples?`, `loading?`. States: default, focus (accent ring plus a subtle `--shadow-glow`), typing, loading/submitting (spinner, `aria-busy`), disabled. A11y: a real `<form role="search">` with a visually-hidden `<label>`, submit on Enter, example chips are buttons that fill the input, `aria-busy` while a query is being parsed.
- **AppShell** (`components/app-shell.tsx`) — the nav/header wrapper for signed-in pages. Structure: a top `<header>` with the "Reel" wordmark (Fraunces), a primary `<nav>` (Feed, Search, Watchlist), and a user menu (avatar opening a Radix DropdownMenu: account, sign out); on mobile the nav collapses (menu or bottom bar); a `<footer>` renders the TMDB attribution globally. Slots: `children` (the page, in `<main>`), an optional page header. States: default, active nav item (accent indicator, `aria-current="page"`), loading (skeleton nav). A11y: landmark elements (`<header>`, `<nav aria-label>`, `<main>`, `<footer>`), a skip-to-content link as the first focusable element, the Radix dropdown is fully keyboard-operable, focus-visible throughout, responsive.

**TMDB attribution placement.** The AppShell `<footer>` renders the attribution once per page using `TMDB_ATTRIBUTION_NOTICE`, `TMDB_LOGO_URL`, and `TMDB_HOME_URL` from `src/lib/tmdb/attribution.ts` (the notice text, the TMDB logo, and a link back to TMDB). Because every signed-in, movie-rendering page is wrapped by the shell, the obligation from ADR 0003 is satisfied globally; individual cards do not repeat it. The movie detail page (a later feature) may add a local attribution too.

### Server vs Client Components (Next.js 16 / React 19)

The app uses React Server Components by default, so each component states its boundary, and the interactive ones are marked `"use client"`.

- **Client components** (`"use client"`): every interactive primitive (Button when it has an `onClick`, Input, Dialog, DropdownMenu, Toast/Sonner, Skeleton shimmer is fine either way) and every product component that takes callback props or uses Motion: RecommendationCard (`onToggleWatchlist`), SwipeCard (`onLike`/`onDislike`, drag), VibeSearchInput (`onChange`/`onSubmit`). PosterImage can stay a server component (it only renders an image or the fallback), but it renders fine inside a client parent too.
- **Server components**: static, presentational pieces stay on the server. Card, Badge, and Label are server-safe unless composed with client behavior.
- **AppShell stays a server-rendered layout.** Do NOT mark the whole shell `"use client"`, or nav, footer, and the TMDB attribution lose server rendering and streaming. Instead the shell is a server component, and only the interactive bits are small client leaves: a `UserMenu` client component (the Avatar + DropdownMenu) and a `MobileNav` client component (the open/close toggle). The header, nav links, `<main>`, and footer render on the server.
- **Callback rule.** A server component cannot pass a plain function to a client component as a prop (only a Server Action can cross that boundary). So a page that renders RecommendationCard/SwipeCard/VibeSearchInput and needs to handle their callbacks is itself a client component (or it passes a Server Action). Later data features decide that per page; the foundation just ships the components with typed props and documents which are client.

### File layout

- `design.md` at the repo root: the visual source of truth, a companion to `AGENTS.md`, read by `/develop` on every UI feature.
- `src/app/globals.css`: `@import "tailwindcss";`, the `@theme` block wiring the tokens above, base layer resets, the `prefers-reduced-motion` block.
- `src/app/layout.tsx`: `next/font` loads Fraunces and Inter, sets the font CSS variables and dark defaults on `<html>`, mounts the Sonner toaster.
- `src/components/ui/`: base primitives (`button.tsx`, `input.tsx`, `card.tsx`, `badge.tsx`, `dialog.tsx`, `skeleton.tsx`, `toast.tsx`).
- `src/components/`: product components (`recommendation-card.tsx`, `swipe-card.tsx`, `vibe-search-input.tsx`, `app-shell.tsx`, `poster-image.tsx`).
- `src/lib/utils.ts`: the `cn()` helper (clsx plus tailwind-merge).
- `src/lib/motion.ts`: shared motion tokens and Motion variants (so components import consistent durations/easings/springs and a reduced-motion helper).

### Accessibility

WCAG AA is a hard requirement, not a nice-to-have. Concretely:
- **Contrast.** Body text at least 4.5:1, large text and UI components and focus indicators at least 3:1, all against their actual background. The palette is designed to these targets; `/develop` verifies each pairing with a contrast checker and nudges a value if any misses.
- **Visible focus.** Every interactive element shows the `--color-ring` focus-visible ring; an outline is never removed without an equal-or-better replacement.
- **Keyboard operability.** Everything interactive is reachable and operable by keyboard in a logical order, with no traps except the intended dialog focus trap (which Escape and a close button both release).
- **Reduced motion.** A global `@media (prefers-reduced-motion: reduce)` block neutralizes transform/scale/parallax/drag-fly animations to short opacity changes or nothing, and Motion components additionally branch on `useReducedMotion`. No essential information is conveyed by motion alone.
- **Semantics.** Real elements and roles, `alt` text on posters, labels on inputs, `aria-pressed` on toggles, `aria-current` on the active nav item, live regions for toasts and the swipe decision.
- **Target size.** Interactive controls are at least 24px; touch controls (the swipe Like/Dislike, mobile nav) aim for 44px.
- **Enforcement (interim).** The project has no CI or test runner yet (deferred in AGENTS.md), so there is no automated a11y or visual-regression gate today. Until one exists, the guardrails are: `design.md` is the single source of tokens (components use token utilities, never a hardcoded hex or ad hoc spacing), `/verify` runs the accessibility scenarios per feature, and code review checks focus, labels, and contrast. A follow-up adds automated a11y checks (axe / jest-axe) and a lint rule that forbids raw hex in components once a test runner and CI land. This is named, not hand-waved: without a gate, consistency depends on discipline until the gate exists.

### Configuration required

- **No new environment variables.** This feature adds no env vars (it is presentational; TMDB and Supabase config already exist from earlier ADRs).
- **New dependencies** (installed just-in-time per AGENTS.md): `tailwindcss` (v4), `@tailwindcss/postcss`, `postcss`; the shadcn-style primitive stack (Radix packages pulled in by the copied components, plus `class-variance-authority`, `clsx`, `tailwind-merge`); `sonner` (toast); `lucide-react` (icons); `motion` (the motion library); optionally `tw-animate-css` for enter/exit keyframes. `next/font` is built into Next.js. `/develop` confirms exact package names and versions against current docs at build time.

### Critical test scenarios

- The app renders in the dark theme by default with the tokens applied (canvas background, Fraunces headings, Inter body) and no light flash. → AC-2
- Every base primitive is reachable and operable by keyboard, shows a visible focus ring, and exposes the correct role (the dialog traps and returns focus and closes on Escape; the toast announces via a live region). → AC-3
- The recommendation card renders with a real TMDB poster, and renders the designed fallback (title, no broken image) when `poster_path` is null; its loading skeleton and the watchlist toggle (with `aria-pressed`) both work. → AC-4, AC-5
- The TMDB attribution (notice, logo, link) renders in the app-shell footer on a movie-rendering page. → AC-5
- A reduced-motion user gets no large motion: the swipe card fades and advances instead of rotating and flying, poster reveals do not transform. → AC-6
- `design.md` documents every token group (color, type scale plus fonts, spacing, radius, elevation, motion) and the component conventions. → AC-1

## Build plan

Ordered and AC-tagged. Tracer Bullet: this is the foundation slice, built and checked as one coherent thread.

1. Install Tailwind v4 plus `@tailwindcss/postcss` and `postcss`, the shadcn-style primitive stack (Radix via copied components, cva, clsx, tailwind-merge), `sonner`, `lucide-react`, and `motion`; wire Tailwind into `globals.css`. Doc-check the current Tailwind v4 plus shadcn-for-v4 setup at build time (Context7 or official docs) before wiring, since v4 changed setup significantly. → AC-2
2. Write `design.md` as the source of truth: the full token set (the tables above) plus the component conventions. → AC-1
3. Wire the tokens as the Tailwind v4 theme (`@theme` in `globals.css`), load Fraunces and Inter via `next/font`, set dark as the default, add the reduced-motion block, and mount the Sonner toaster in the layout. → AC-2, AC-6
4. Build the accessible base primitives (button, input, label, card, badge, dialog, skeleton, toast, dropdown-menu, avatar) with focus rings and keyboard behavior. → AC-3
5. Build the product shells (PosterImage, recommendation card, swipe card, vibe-search input, app shell) as presentational components with clear props and their loading/empty states. → AC-4
6. Finish the poster fallback in PosterImage, wire lucide icon usage, and render the TMDB attribution element in the app-shell footer. → AC-5
7. Finalize motion: the `motion` library for the swipe and reveals plus the CSS transition tokens, all gated on `prefers-reduced-motion` (media query and `useReducedMotion`). → AC-6

Optionally add a temporary preview route (for example `src/app/(dev)/preview`) that renders every component and state on one page, as a verification aid to eyeball the system. It is not required and can be removed after review.

## Consequences

**Positive**
- One coherent, distinctive, cinematic-editorial foundation that every later screen builds on, with a documented token set a developer can build any screen from.
- Accessibility is baked in (Radix behavior plus AA contrast plus reduced-motion), so later features inherit it instead of re-deriving it.
- We own all the component code and classes, so the look stays fully custom and there is no library theme to fight.
- Tokens are CSS variables, so a light theme later is a set of overrides, not a rewrite.

**Negative**
- A custom design system is more upfront work than adopting a prebuilt styled library; we style every variant and state ourselves.
- Dark-only excludes users who need a light theme until it is built (tracked as a follow-up).
- Fraunces is a display serif and adds font weight to load and needs contrast and size care (mitigated by variable `next/font` self-hosting and reserving the serif for large sizes).
- Building the four product shells before their data features exist risks some rework if a feature's needs shift; bounded by keeping every shell presentational with clear props.
- Tailwind v4 and the shadcn-for-v4 setup are newer and this ADR's version-sensitive details may be stale, so the build must verify the exact current setup against docs rather than trusting them.

**Neutral**
- Adds a small set of dependencies (Tailwind v4, the Radix-based primitives, Sonner, lucide-react, motion), installed just-in-time per AGENTS.md.
- `design.md` at the repo root becomes a second source-of-truth doc alongside `AGENTS.md` that must be kept current as the system evolves.

## Follow-up
- [ ] Light theme: the tokens are structured for it (CSS variables under a selector); build when a light theme is actually needed.
- [ ] `/develop` should use the `frontend-design` skill when building these components (it is highly relevant to producing distinctive, production-grade UI), and `AGENTS.md` should reference that skill (it is installed but not yet referenced).
- [ ] A component preview/gallery route to visually review the whole system on one page (can start as the optional dev preview from the build plan).
- [ ] Automated design-system regression protection once a test runner and CI exist: axe / jest-axe accessibility checks on the components, and a lint rule forbidding raw hex/ad hoc values in components (tokens only). Until then, `design.md` as the single token source plus `/verify` plus code review are the guard.
