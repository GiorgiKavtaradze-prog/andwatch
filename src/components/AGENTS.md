# UI components

Reel's design system components. The visual source of truth is [design.md](../../design.md) (tokens, type scale, motion, component conventions) and the governing decision is ADR 0004 (`docs/adr/0004-design-system-ui-foundation/`).

## Layout

- **Base primitives** in `src/components/ui/` (button, input, label, card, badge, dialog, skeleton, toast, dropdown-menu, avatar). Built shadcn-style on Radix, styled to the tokens, we own the code.
- **Product components** at `src/components/` top level (poster-image, recommendation-card, swipe-card, vibe-search-input, app-shell, user-menu, mobile-nav). Presentational shells: typed props in, callbacks out, no data fetching.

## Rules

- **Tokens only.** Every color, space, radius, shadow, and font comes from a design token, as a Tailwind utility (`bg-canvas`, `text-accent`, `rounded-lg`, `shadow-e1`, `font-serif`) or `var(--token)`. Never hardcode a hex or a raw px that duplicates a token. Tokens are defined in `src/app/globals.css` (`@theme`).
- **Server vs client.** Mark a file `"use client"` only if it uses callbacks/state, Radix, or `motion`. Keep pages and `app-shell.tsx` server-rendered; push interactivity into small client leaves (e.g. `user-menu.tsx`, `mobile-nav.tsx`). A server component cannot pass a plain function to a client component (only a Server Action can cross that boundary).
- **Accessibility (WCAG AA).** Every interactive element has a visible `focus-visible` ring, full keyboard operability, and correct roles. Icon-only buttons need an `aria-label`. Respect `prefers-reduced-motion` in every animation (the global CSS block plus `useReducedMotion` in motion components).
- **Fonts.** Fraunces (`font-serif`) for display and headings only; Inter (`font-sans`) for body, UI, and anything small.
- **Imports.** `cn()` from `@/lib/utils`; motion tokens from `@/lib/motion`; poster URLs and TMDB attribution from `@/lib/tmdb/attribution`. Icons from `lucide-react`. Motion from `motion/react`.
- **Movie art.** Use `poster-image.tsx`, which renders the designed fallback (never a broken image) when `poster_path` is null.

Use the `frontend-design` skill when building or extending these components.
