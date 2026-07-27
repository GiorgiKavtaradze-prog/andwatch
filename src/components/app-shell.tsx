import Image from "next/image";
import Link from "next/link";
import { TMDB_ATTRIBUTION_NOTICE, TMDB_HOME_URL, TMDB_LOGO_URL } from "@/lib/tmdb/attribution";
import { cn } from "@/lib/utils";
import { MobileNav, type NavItem } from "./mobile-nav";
import { UserMenu } from "./user-menu";

const DEFAULT_NAV: Omit<NavItem, "current">[] = [
  { label: "Feed", href: "/feed" },
  { label: "Import", href: "/import" },
  { label: "Search", href: "/search" },
  { label: "Watchlist", href: "/watchlist" },
];

export interface AppShellProps {
  children: React.ReactNode;
  /** The current pathname, used to mark the active nav item. */
  activeHref?: string;
  userName?: string;
  avatarUrl?: string | null;
  /** Sign-out handler (a server action), passed through to the UserMenu. */
  onSignOut?: () => void | Promise<void>;
}

/**
 * Server-rendered app frame: header (Reel wordmark + primary nav + user menu),
 * a skip link, the page `<main>`, and the global TMDB attribution footer.
 * Interactive bits are small client leaves (UserMenu, MobileNav).
 */
export function AppShell({ children, activeHref, userName, avatarUrl, onSignOut }: AppShellProps) {
  const items: NavItem[] = DEFAULT_NAV.map((item) => ({
    ...item,
    current: activeHref === item.href,
  }));

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-text">
      <a
        href="#main-content"
        className="sr-only rounded-md bg-accent px-4 py-2 font-sans text-sm font-medium text-accent-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-canvas"
      >
        Skip to content
      </a>

      <header className="relative border-b border-border bg-canvas/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <MobileNav items={items} />
            <Link
              href="/feed"
              className="rounded-md font-serif text-2xl font-semibold tracking-tight text-text outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Reel
            </Link>
          </div>

          <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={item.current ? "page" : undefined}
                    className={cn(
                      "rounded-md px-3 py-2 font-sans text-sm font-medium outline-none transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                      item.current ? "text-accent" : "text-text-secondary hover:text-text",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <UserMenu userName={userName} avatarUrl={avatarUrl} onSignOut={onSignOut} />
        </div>
      </header>

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 md:px-8">
        {children}
      </main>

      <footer className="border-t border-border bg-canvas">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-3 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-8">
          <p className="max-w-prose font-sans text-xs leading-relaxed text-text-muted">
            {TMDB_ATTRIBUTION_NOTICE}
          </p>
          <a
            href={TMDB_HOME_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="The Movie Database (opens in a new tab)"
            className="inline-flex shrink-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            <Image
              src={TMDB_LOGO_URL}
              alt="The Movie Database"
              width={90}
              height={12}
              className="h-3 w-auto"
            />
          </a>
        </div>
      </footer>
    </div>
  );
}
