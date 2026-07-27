---
version: 1
name: reel-design-system
description: "Cinematic, dark, editorial. A deep near-black canvas where posters lead, a refined serif (Fraunces) for titles paired with a clean sans (Inter), and a single marquee-gold accent. Premium and film-lover, WCAG AA, dark-first."
---

# Reel design system

The single source of truth for Reel's look. Every color, size, spacing, radius, shadow, and motion value comes from the tokens here. Do not invent values in components. Tokens live as CSS variables in `src/app/globals.css` (wired into Tailwind v4 `@theme`), so they are usable both as utility classes (`bg-canvas`, `text-accent`, `rounded-lg`, `shadow-e1`, `font-serif`) and as `var(--token)`.

Governed by ADR 0004 (`docs/adr/0004-design-system-ui-foundation/`).

## Overview

- **Direction:** cinematic dark and editorial. Posters and imagery lead; type is refined; space is generous.
- **Theme:** dark-first (and only, for now). Tokens are CSS variables so a light theme can be added later under a `[data-theme="light"]` selector without touching components.
- **Stack:** Tailwind CSS v4 (CSS-first `@theme`), shadcn-style copy-in primitives on Radix (we own the code), lucide icons, `motion` for the few key animations, `next/font` for Fraunces + Inter.
- **Accessibility:** WCAG AA is a hard requirement. Visible focus, full keyboard operability, `prefers-reduced-motion` respected, real semantics.

## Colors

Dark theme. Utility form in parentheses.

| Token | Variable (utility) | Value | Role |
|---|---|---|---|
| Canvas | `--color-canvas` (`bg-canvas`) | `#0A0A0C` | App background, deepest layer |
| Surface 1 | `--color-surface-1` | `#141417` | Cards, raised panels |
| Surface 2 | `--color-surface-2` | `#1C1C21` | Popovers, dialog panel, inputs |
| Surface 3 | `--color-surface-3` | `#26262C` | Hover on a surface, higher lift |
| Border | `--color-border` | `#2A2A31` | Default hairline border |
| Border strong | `--color-border-strong` | `#3A3A43` | Emphasized border, dividers |
| Text | `--color-text` (`text-text`) | `#F5F3EF` | Primary text (warm off-white) |
| Text secondary | `--color-text-secondary` | `#B4B1AA` | Secondary text, meta |
| Text muted | `--color-text-muted` | `#7C7A74` | Muted text, placeholders, captions |
| Accent | `--color-accent` (`text-accent`/`bg-accent`) | `#E6B450` | Marquee gold: primary action, focus |
| Accent hover | `--color-accent-hover` | `#F0C266` | Accent hover |
| Accent active | `--color-accent-active` | `#CE9E3C` | Accent pressed |
| Accent foreground | `--color-accent-foreground` | `#0A0A0C` | Text/icon on an accent fill |
| Success | `--color-success` | `#5FBF8F` | Positive status |
| Warning | `--color-warning` | `#E08A3C` | Caution status |
| Danger | `--color-danger` | `#E5675E` | Error, destructive |
| Danger foreground | `--color-danger-foreground` | `#0A0A0C` | Text on a danger fill |
| Ring | `--color-ring` | `#F0C266` | Focus-visible ring |
| Scrim | `--color-scrim` | `rgba(0,0,0,0.72)` | Dialog overlay (with blur) |

Contrast (all meet AA): text on canvas ~17:1, secondary ~9:1, muted ~4.7:1, accent on canvas ~9:1, semantics all above 4.5:1. Never convey state by color alone; pair with text or icon.

## Typography

Serif is **Fraunces** (`--font-serif`, `font-serif`), sans is **Inter** (`--font-sans`, `font-sans`), both variable, loaded via `next/font/google` in the root layout. Serif is for display and headings only; sans for body, UI, meta, and anything small.

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
| Caption / overline | Inter | 0.75rem (12) | 1.4 | 500 | 0.08em, uppercase |

The recommendation "why this fits you" reason uses Fraunces italic at body-large size in `text-secondary`, styled like a pull quote. The caption/overline role is used for meta labels and the TMDB attribution.

## Layout

Spacing uses Tailwind's default 4px scale (`1`=4px … `4`=16px, `6`=24px, `8`=32px, `12`=48px, `16`=64px, `20`=80px, `24`=96px). Editorial generosity is a convention:
- Page gutters: `4` (mobile) to `8`/`12` (desktop).
- Section rhythm: `16` to `24`.
- Card padding: `4` to `6`. Related-element gaps: `2` to `3`.
- Text measure: 60 to 75 characters (`max-w-prose`) for long-form.

Prefer `gap`, `grid`, `flex` over margins. Use logical properties (`padding-inline`, `margin-inline-start`) for RTL-readiness.

## Elevation & depth

On dark, surface color steps and hairline borders do most of the lifting; shadows are soft and sparing. A 1px inset top highlight adds a subtle catch light.

| Token | Value |
|---|---|
| `--shadow-e1` (`shadow-e1`) card | `0 1px 2px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.03)` |
| `--shadow-e2` hover/raised | `0 4px 14px rgba(0,0,0,0.45)` |
| `--shadow-e3` popover/dialog | `0 16px 40px rgba(0,0,0,0.55)` |
| `--shadow-glow` emphasis | `0 8px 30px rgba(230,180,80,0.15)` |

## Shapes

| Token | Value | Used by |
|---|---|---|
| `--radius-sm` (`rounded-sm`) | 6px | Badge, small controls |
| `--radius-md` (`rounded-md`) | 10px | Button, input |
| `--radius-lg` (`rounded-lg`) | 14px | Card, poster tile |
| `--radius-xl` (`rounded-xl`) | 20px | Dialog, large panels |
| `--radius-2xl` (`rounded-2xl`) | 28px | Hero surfaces |
| `rounded-full` | 9999px | Pills, avatar, icon buttons |

Poster tiles use the 2:3 aspect ratio.

## Motion

Subtle and tasteful. Most motion is CSS transitions on hover/focus; `motion` (imported from `motion/react`, client components only) handles the swipe gesture and coordinated reveals. Tokens in `src/lib/motion.ts` mirror the CSS duration variables.

| Token | Value | Use |
|---|---|---|
| `--duration-instant` | 80ms | tiny state flips |
| `--duration-fast` | 150ms | hover, focus, color/opacity |
| `--duration-base` | 220ms | standard transitions |
| `--duration-slow` | 320ms | larger panel transitions |
| `--duration-reveal` | 480ms | page/poster reveals |
| `--ease-standard` | `cubic-bezier(0.2,0,0,1)` | default |
| `--ease-out` | `cubic-bezier(0.16,1,0.3,1)` | reveals |
| `--ease-in-out` | `cubic-bezier(0.65,0,0.35,1)` | symmetric |
| swipe spring | `{ stiffness: 300, damping: 30 }` | swipe release |

`prefers-reduced-motion: reduce` removes transforms/scale/drag-fly/parallax, leaving short opacity changes only. Motion components also branch on `useReducedMotion`.

## Components

Base primitives live in `src/components/ui/`; product components at `src/components/`. Every interactive element shows a 2px `--color-ring` focus-visible ring at 2px offset.

- **Button** (`ui/button.tsx`): variants primary/secondary/ghost/destructive; sizes sm/md/lg/icon. Real `<button>` or `<a>`; icon-only needs `aria-label`; loading sets `aria-busy` with a `Loader2` spinner.
- **Input** (`ui/input.tsx`) + **Label** (`ui/label.tsx`, Radix): always paired via `htmlFor`; error state uses danger border, `aria-invalid`, message linked by `aria-describedby`.
- **Card** (`ui/card.tsx`): surface-1, `rounded-lg`, hairline border, `shadow-e1`, header/media/content/footer slots. Interactive variant lifts to e2.
- **Badge** (`ui/badge.tsx`): neutral/accent/success/warning/danger/outline pills.
- **Dialog** (`ui/dialog.tsx`, Radix): scrim + blur, surface-2 panel, `rounded-xl`, `shadow-e3`, focus trap, Escape closes, labelled/described.
- **Skeleton** (`ui/skeleton.tsx`): surface-2 shimmer; static under reduced motion; loading region carries `aria-busy` + visually-hidden `role="status"`.
- **Toast** (`ui/toast.tsx`, Sonner): mounted in the layout; live region announces.
- **DropdownMenu** (`ui/dropdown-menu.tsx`, Radix) + **Avatar** (`ui/avatar.tsx`, Radix, initials fallback): used by the app-shell user menu.
- **PosterImage** (`poster-image.tsx`): `next/image` from `posterUrl(posterPath, size)` at 2:3, or a designed fallback (surface gradient, faint film-frame watermark, title in Fraunces) when `posterPath` is null. Alt is the movie title.
- **RecommendationCard** (`recommendation-card.tsx`): poster, title (Fraunces), meta (year/runtime/genre badges), the "why this fits you" reason (Fraunces italic), add-to-watchlist toggle (`Bookmark`/`BookmarkCheck`, `aria-pressed`). One stretched link to detail; watchlist is a separate button.
- **SwipeCard** (`swipe-card.tsx`): poster + Like/Dislike buttons + drag gesture; keyboard-operable; decision announced via `aria-live`; no fly-out under reduced motion.
- **VibeSearchInput** (`vibe-search-input.tsx`): `<form role="search">`, `Sparkles` icon, visually-hidden label, example chips as buttons, `aria-busy` while parsing.
- **AppShell** (`app-shell.tsx`): server layout with `<header>` (Reel wordmark), `<nav aria-label>`, `<main id>`, `<footer>` (TMDB attribution). Interactive bits (`UserMenu`, `MobileNav`) are small client leaves. Skip-to-content link is the first focusable element. `aria-current="page"` on the active nav item.

TMDB attribution renders once per page in the app-shell footer, using `TMDB_ATTRIBUTION_NOTICE`, `TMDB_LOGO_URL`, `TMDB_HOME_URL` from `src/lib/tmdb/attribution.ts`.

## Do's and don'ts

### Do
- Use token utilities and `var(--token)`. Every color/space/radius/shadow comes from a token.
- Reserve Fraunces for large sizes (display, headings). Use Inter for body, meta, and anything under ~18px.
- Give every interactive element a visible focus-visible ring, a keyboard path, and correct semantics.
- Keep product components presentational: typed props in, callbacks out, no data fetching.
- Mark components that use callbacks, Radix, or motion with `"use client"`. Keep the app shell a server layout with small client leaves.
- Respect `prefers-reduced-motion` in every animation.

### Don't
- Don't hardcode a hex, rgb, or a raw px that duplicates a token.
- Don't use the serif for body or dense meta text.
- Don't convey status by color alone.
- Don't mark a whole page or the app shell `"use client"` just to make one child interactive.
- Don't render a broken image; use the PosterImage fallback.

## Responsive behavior

Mobile-first. Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`. Body text never below 16px. Touch targets at least 44px (interactive controls at least 24px). The app-shell nav collapses to a menu/bottom bar on mobile.
